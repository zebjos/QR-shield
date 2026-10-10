"""
QR Shield backend — minimal FastAPI service that performs the real security
checks the mobile app displays:

  GET  /check?url=<url>  → verdict + indicators + report count
  POST /report           → increment report count for the URL's registrable domain
  DELETE /report         → undo last report

Signals used:
  - Final destination after following redirects (unshortens bit.ly etc.)
  - Domain registration date via RDAP (rdap.org — keyless, free)
  - Local heuristics: IP-literal host, punycode (xn--), scheme (HTTPS?)
  - Known shortener list
  - Community report count from SQLite

No API keys. SQLite file is created on first run. CORS is wide open — this is
a demo backend, not a production service.
"""

from __future__ import annotations

import asyncio
import os
import re
import sqlite3
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import base64
import io

import httpx
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel
from pyzbar.pyzbar import decode as zbar_decode

import threat_intel
import trusted_sources

DB_PATH = Path(os.environ.get("DB_PATH", Path(__file__).parent / "reports.sqlite3"))
FETCH_TIMEOUT = 5.0
NEW_DOMAIN_THRESHOLD_DAYS = 30

KNOWN_SHORTENERS = {
    "bit.ly", "t.co", "tinyurl.com", "goo.gl", "ow.ly", "is.gd",
    "buff.ly", "cutt.ly", "rb.gy", "rebrand.ly", "short.io", "tiny.cc",
}

MULTIPART_TLDS = {
    "co.uk", "co.jp", "co.kr", "co.nz", "co.za", "com.au", "com.br",
    "com.cn", "com.mx", "com.tr", "ac.uk", "gov.uk", "org.uk",
    "ne.jp", "or.jp",
}

IPV4_RE = re.compile(
    r"^(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)$"
)

# Payment-looking URL heuristic — covers the common merchant / donation / pay-
# me paths and host prefixes. Precision over recall: we'd rather miss a
# payment page than yell "sticker!" on every URL.
PAYMENT_RE = re.compile(
    r"(?i)(?:^|[./-])(pay|payment|checkout|stripe|paypal|revolut|lydia|"
    r"sumup|wero|wise|monzo|venmo|cashapp|donate|donation|invoice|billing|"
    r"paiement|caisse)(?:[./-]|$)"
)


# --- DB ---------------------------------------------------------------------

def init_db() -> None:
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS reports (
              host TEXT PRIMARY KEY,
              count INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        # Seed a few hosts so the demo isn't empty on first run.
        for host, count in [
            ("paypal-secure-login.com", 12),
            ("bit.ly", 3),
            ("amazon-support.help", 7),
            ("update-account-verify.net", 25),
            ("chase-signin.co", 4),
        ]:
            conn.execute(
                "INSERT OR IGNORE INTO reports(host, count) VALUES (?, ?)",
                (host, count),
            )
        conn.commit()


def get_report_count(host: str) -> int:
    with sqlite3.connect(DB_PATH) as conn:
        row = conn.execute(
            "SELECT count FROM reports WHERE host = ?", (host,)
        ).fetchone()
        return int(row[0]) if row else 0


def bump_report(host: str, delta: int) -> int:
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO reports(host, count) VALUES (?, MAX(0, ?))
            ON CONFLICT(host) DO UPDATE SET count = MAX(0, count + ?)
            """,
            (host, delta, delta),
        )
        row = conn.execute(
            "SELECT count FROM reports WHERE host = ?", (host,)
        ).fetchone()
        conn.commit()
        return int(row[0]) if row else 0


# --- URL helpers ------------------------------------------------------------

def get_host(url: str) -> Optional[str]:
    try:
        return urlparse(url).hostname.lower() if urlparse(url).hostname else None
    except Exception:
        return None


def is_ip_host(host: str) -> bool:
    if IPV4_RE.match(host):
        return True
    return host.startswith("[") and host.endswith("]")


def has_punycode(host: str) -> bool:
    return any(label.startswith("xn--") for label in host.split("."))


def registrable_domain(host: str) -> str:
    labels = host.lower().split(".")
    if len(labels) < 2:
        return host
    last_two = ".".join(labels[-2:])
    if last_two in MULTIPART_TLDS and len(labels) >= 3:
        return ".".join(labels[-3:])
    return last_two


# --- Outbound checks --------------------------------------------------------

async def resolve_final_url(url: str) -> str:
    try:
        async with httpx.AsyncClient(
            follow_redirects=True, timeout=FETCH_TIMEOUT
        ) as client:
            resp = await client.get(url)
            return str(resp.url)
    except Exception:
        return url


async def get_domain_age_days(host: str) -> Optional[int]:
    if is_ip_host(host):
        return None
    try:
        async with httpx.AsyncClient(timeout=FETCH_TIMEOUT) as client:
            resp = await client.get(f"https://rdap.org/domain/{host}")
            if resp.status_code != 200:
                return None
            data = resp.json()
    except Exception:
        return None
    events = data.get("events", []) or []
    for e in events:
        if e.get("eventAction") == "registration":
            try:
                ts = datetime.fromisoformat(
                    e["eventDate"].replace("Z", "+00:00")
                )
                return (datetime.now(timezone.utc) - ts).days
            except Exception:
                return None
    return None


# --- Verdict building -------------------------------------------------------

def human_age(days: Optional[int]) -> str:
    if days is None:
        return "Unknown"
    if days < 1:
        return "Created today"
    if days < 30:
        return f"Created {days} day{'s' if days != 1 else ''} ago"
    if days < 365:
        months = days // 30
        return f"Created {months} month{'s' if months != 1 else ''} ago"
    years = days // 365
    created_year = datetime.now(timezone.utc).year - years
    return f"Created in {created_year}"


class Indicator(BaseModel):
    label: str
    value: str
    attention: bool


class CheckResponse(BaseModel):
    status: str  # "safe" | "unknown" | "dangerous"
    reasonCode: Optional[str] = None
    reason: Optional[str] = None
    finalUrl: str
    host: Optional[str]
    registrableDomain: Optional[str]
    redirectedFrom: Optional[str] = None
    shortenerUsed: Optional[str] = None
    punycode: bool
    paymentLike: bool = False
    domainAgeDays: Optional[int]
    reportCount: int
    threatIntelSources: list[str] = []
    trustedRank: Optional[int] = None
    indicators: list[Indicator]


DANGER_TEXT = {
    "brandLookalike": "This link mimics a well-known brand’s domain name.",
    "newlyRegisteredDomain": "This domain was registered very recently.",
    "ipAddressHost":
        "This link points to a raw IP address instead of a normal website name.",
    "reportedPhishing": "This domain has been reported for phishing.",
}


def build_indicators(
    url: str,
    final_url: str,
    host: Optional[str],
    age_days: Optional[int],
    shortener: Optional[str],
    report_count: int,
    threat_sources: list[str],
    trusted_rank: Optional[int],
) -> list[Indicator]:
    is_https = final_url.lower().startswith("https://")
    is_young = (
        age_days is not None and age_days < 365 and age_days >= 0
    )
    return [
        Indicator(
            label="Reputation",
            value=(
                f"Trusted (rank #{trusted_rank:,})"
                if trusted_rank is not None
                else "Not on trusted lists"
            ),
            attention=False,
        ),
        Indicator(
            label="Domain age",
            value=human_age(age_days),
            attention=is_young,
        ),
        Indicator(
            label="Redirects",
            value=(
                f"Redirects via {shortener}" if shortener else "No redirects"
            ),
            attention=bool(shortener),
        ),
        Indicator(
            label="Connection",
            value="HTTPS" if is_https else "No HTTPS",
            attention=not is_https,
        ),
        Indicator(
            label="Community",
            value=(
                f"{report_count} report{'s' if report_count != 1 else ''}"
                if report_count > 0
                else "No reports"
            ),
            attention=report_count > 0,
        ),
        Indicator(
            label="Threat intel",
            value=(
                "Flagged by " + ", ".join(threat_sources)
                if threat_sources
                else "Clean"
            ),
            attention=bool(threat_sources),
        ),
    ]


# --- App --------------------------------------------------------------------

@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    # Fire-and-forget: load the GitHub phishing lists + trusted top-domain
    # lists and refresh them in the background. Never awaited — the first
    # /check may land before the first load finishes; it just gets neutral
    # answers until then.
    tasks = [
        asyncio.create_task(threat_intel.start_background_refresh()),
        asyncio.create_task(trusted_sources.start_background_refresh()),
    ]
    try:
        yield
    finally:
        for t in tasks:
            t.cancel()


app = FastAPI(title="QR Shield backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


async def _none():
    return None


async def _empty_list():
    return []


@app.get("/health")
async def health():
    return {
        "ok": True,
        "githubPhishing": threat_intel.github_stats(),
        "trustedSources": trusted_sources.stats(),
    }


@app.get("/check", response_model=CheckResponse)
async def check(url: str) -> CheckResponse:
    if not url or not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(status_code=400, detail="Only http(s) URLs accepted")

    # Resolve redirects and RDAP in parallel on the input host first,
    # then if the final URL has a different host, overwrite the age.
    final_url, _ = await asyncio.gather(
        resolve_final_url(url),
        asyncio.sleep(0),
    )

    final_host = get_host(final_url)
    orig_host = get_host(url)
    redirected = final_url != url
    shortener = orig_host if (orig_host in KNOWN_SHORTENERS) else None

    reg_domain = registrable_domain(final_host) if final_host else None

    # Run threat intel + domain age + report count in parallel — all three are
    # independent and together form the slowest leg of the request.
    age_task = asyncio.create_task(
        get_domain_age_days(final_host) if final_host else _none()
    )
    intel_task = asyncio.create_task(
        threat_intel.run_all(final_url, final_host or "", reg_domain or "")
        if final_host
        else _empty_list()
    )
    age_days = await age_task
    hits = await intel_task
    threat_sources = [h.source for h in hits]
    report_count = get_report_count(reg_domain) if reg_domain else 0
    trusted_rank = (
        trusted_sources.get_rank(reg_domain) if reg_domain else None
    )
    is_trusted = (
        trusted_rank is not None
        and trusted_rank <= trusted_sources.TRUSTED_RANK_CUTOFF
    )

    status = "unknown"
    reason_code: Optional[str] = None
    reason: Optional[str] = None

    # Priority: external threat intel > local red flags > community > trusted.
    # A trusted top-site rank is advisory; it never overrides a threat hit
    # (an attacker could have compromised a popular domain).
    if hits:
        status, reason_code = "dangerous", "reportedPhishing"
        reason = "Flagged by " + ", ".join(threat_sources) + "."
    elif final_host and is_ip_host(final_host):
        status, reason_code = "dangerous", "ipAddressHost"
    elif final_host and has_punycode(final_host):
        status, reason_code = "dangerous", "brandLookalike"
    elif age_days is not None and 0 <= age_days < NEW_DOMAIN_THRESHOLD_DAYS:
        status, reason_code = "dangerous", "newlyRegisteredDomain"
    elif report_count >= 10:
        status, reason_code = "dangerous", "reportedPhishing"
    elif is_trusted:
        status = "safe"
        reason = f"Trusted top-site (rank #{trusted_rank:,} on Tranco / Majestic)."
    else:
        is_https = final_url.lower().startswith("https://")
        is_old = age_days is not None and age_days > 5 * 365
        if is_https and is_old and not shortener and report_count == 0:
            status = "safe"

    if reason_code and not reason:
        reason = DANGER_TEXT.get(reason_code)

    indicators = build_indicators(
        url, final_url, final_host, age_days, shortener, report_count,
        threat_sources, trusted_rank,
    )

    return CheckResponse(
        status=status,
        reasonCode=reason_code,
        reason=reason,
        finalUrl=final_url,
        host=final_host,
        registrableDomain=reg_domain,
        redirectedFrom=url if redirected else None,
        shortenerUsed=shortener,
        punycode=bool(final_host and has_punycode(final_host)),
        paymentLike=bool(PAYMENT_RE.search(final_url)),
        domainAgeDays=age_days,
        reportCount=report_count,
        threatIntelSources=threat_sources,
        trustedRank=trusted_rank,
        indicators=indicators,
    )


class DecodeBody(BaseModel):
    image: str  # base64-encoded image bytes (no data: prefix)
    mime: str | None = None


def _decode_qr_from_bytes(content: bytes) -> str:
    try:
        img = Image.open(io.BytesIO(content))
        img.load()
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read image")
    results = zbar_decode(img)
    for r in results:
        if r.type == "QRCODE":
            return r.data.decode("utf-8", errors="replace")
    raise HTTPException(status_code=404, detail="No QR code found in image")


@app.post("/decode")
async def decode_image(body: DecodeBody) -> dict:
    """Decode a QR code from a base64-encoded image. 404 if no QR found."""
    try:
        content = base64.b64decode(body.image, validate=False)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 payload")
    return {"data": _decode_qr_from_bytes(content)}


@app.post("/decode-multipart")
async def decode_multipart(file: UploadFile = File(...)) -> dict:
    """Legacy multipart variant kept for curl/web clients that prefer it."""
    content = await file.read()
    return {"data": _decode_qr_from_bytes(content)}


class ReportBody(BaseModel):
    url: str


@app.post("/report")
async def report(body: ReportBody) -> dict:
    host = get_host(body.url)
    if not host:
        raise HTTPException(status_code=400, detail="Invalid URL")
    reg = registrable_domain(host)
    count = bump_report(reg, +1)
    return {"host": reg, "count": count}


@app.delete("/report")
async def unreport(body: ReportBody) -> dict:
    host = get_host(body.url)
    if not host:
        raise HTTPException(status_code=400, detail="Invalid URL")
    reg = registrable_domain(host)
    count = bump_report(reg, -1)
    return {"host": reg, "count": count}

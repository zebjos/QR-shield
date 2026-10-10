"""
Threat intelligence lookups. Each source is a standalone async function:
takes `(url, host, client)`, returns a `ThreatHit | None`.

Design rules:
  - If the required API key is missing, the function returns None (source
    silently skipped — no 500s).
  - Any network/parse exception also returns None. Threat intel is best-
    effort; one slow endpoint should never fail the whole /check.
  - A hit always carries the source name so the UI can show "Flagged by
    URLhaus, Google Safe Browsing" rather than a generic reason.

Sources:
  - URLhaus (abuse.ch) — malware distribution URLs
  - ThreatFox (abuse.ch) — IOCs (malware, C2, phishing)
  - Google Safe Browsing v4 — Google's malware + phishing lists
  - PhishTank — community-verified phishing
  - AlienVault OTX — threat pulses (community-sourced indicators)
  - GitHub phishing-domains lists — mitchellkrogza/Phishing.Database,
    polkadot-js/phishing, etc. Loaded once + refreshed in the background,
    checked locally (O(1) set lookup, no outbound call per request).
"""

from __future__ import annotations

import asyncio
import base64
import os
from dataclasses import dataclass
from typing import Optional

import httpx


@dataclass
class ThreatHit:
    source: str
    detail: Optional[str] = None


OTX_KEY = os.environ.get("OTX_API_KEY")
ABUSE_CH_KEY = os.environ.get("ABUSE_CH_AUTH_KEY")
PHISHTANK_KEY = os.environ.get("PHISHTANK_API_KEY")
GSB_KEY = os.environ.get("GOOGLE_SAFE_BROWSING_KEY")

# GitHub-sourced phishing domain lists — refreshed in the background.
GITHUB_PHISHING_SOURCES = [
    (
        "mitchellkrogza/Phishing.Database",
        "https://raw.githubusercontent.com/mitchellkrogza/Phishing.Database/master/phishing-domains-ACTIVE.txt",
    ),
    (
        "polkadot-js/phishing",
        "https://raw.githubusercontent.com/polkadot-js/phishing/master/all.json",
    ),
]
GITHUB_REFRESH_INTERVAL_SECONDS = 6 * 3600

# In-memory sets filled by refresh_github_lists().
_phishing_domains: set[str] = set()
_phishing_sources_loaded: dict[str, int] = {}


def _parse_hosts_list(text: str) -> set[str]:
    """Parse a one-domain-per-line text file (comments start with #)."""
    out: set[str] = set()
    for raw in text.splitlines():
        line = raw.strip().lower()
        if not line or line.startswith("#"):
            continue
        # Some lists use "0.0.0.0 domain.com" hosts format.
        parts = line.split()
        candidate = parts[-1]
        if "." in candidate:
            out.add(candidate)
    return out


def _parse_polkadot(text: str) -> set[str]:
    """polkadot-js/phishing all.json has shape {"deny": [...], "allow": [...]}."""
    try:
        import json
        data = json.loads(text)
        return {d.lower() for d in data.get("deny", []) if isinstance(d, str) and "." in d}
    except Exception:
        return set()


async def refresh_github_lists() -> None:
    merged: set[str] = set()
    loaded: dict[str, int] = {}
    async with httpx.AsyncClient(timeout=30.0) as client:
        for name, url in GITHUB_PHISHING_SOURCES:
            try:
                r = await client.get(url)
                if r.status_code != 200:
                    continue
                if url.endswith(".json"):
                    parsed = _parse_polkadot(r.text)
                else:
                    parsed = _parse_hosts_list(r.text)
                merged |= parsed
                loaded[name] = len(parsed)
            except Exception:
                continue
    global _phishing_domains, _phishing_sources_loaded
    _phishing_domains = merged
    _phishing_sources_loaded = loaded


async def start_background_refresh() -> None:
    """Fire-and-forget task to keep the GitHub lists fresh."""
    await refresh_github_lists()
    while True:
        await asyncio.sleep(GITHUB_REFRESH_INTERVAL_SECONDS)
        try:
            await refresh_github_lists()
        except Exception:
            pass


def github_stats() -> dict[str, int]:
    return {
        "total_domains": len(_phishing_domains),
        "sources": dict(_phishing_sources_loaded),
    }


# --- Individual checks ------------------------------------------------------

async def check_github_phishing(
    url: str, host: str, registrable: str, client: httpx.AsyncClient
) -> Optional[ThreatHit]:
    if not _phishing_domains:
        return None
    if host in _phishing_domains or registrable in _phishing_domains:
        return ThreatHit(source="GitHub phishing lists")
    return None


async def check_urlhaus(
    url: str, host: str, registrable: str, client: httpx.AsyncClient
) -> Optional[ThreatHit]:
    if not ABUSE_CH_KEY:
        return None
    try:
        r = await client.post(
            "https://urlhaus-api.abuse.ch/v1/url/",
            data={"url": url},
            headers={"Auth-Key": ABUSE_CH_KEY},
            timeout=5.0,
        )
        data = r.json()
        if data.get("query_status") == "ok":
            threat = data.get("threat") or "malware"
            return ThreatHit(source="URLhaus", detail=threat)
    except Exception:
        pass
    return None


async def check_threatfox(
    url: str, host: str, registrable: str, client: httpx.AsyncClient
) -> Optional[ThreatHit]:
    if not ABUSE_CH_KEY:
        return None
    try:
        r = await client.post(
            "https://threatfox-api.abuse.ch/api/v1/",
            json={"query": "search_ioc", "search_term": host},
            headers={"Auth-Key": ABUSE_CH_KEY},
            timeout=5.0,
        )
        data = r.json()
        if data.get("query_status") == "ok" and data.get("data"):
            malware = data["data"][0].get("malware") or "IOC match"
            return ThreatHit(source="ThreatFox", detail=malware)
    except Exception:
        pass
    return None


async def check_phishtank(
    url: str, host: str, registrable: str, client: httpx.AsyncClient
) -> Optional[ThreatHit]:
    if not PHISHTANK_KEY:
        return None
    try:
        # PhishTank wants the URL base64-encoded in the `url` field + an app_key.
        encoded = base64.b64encode(url.encode()).decode()
        r = await client.post(
            "https://checkurl.phishtank.com/checkurl/",
            data={"url": encoded, "format": "json", "app_key": PHISHTANK_KEY},
            timeout=5.0,
        )
        data = r.json()
        results = data.get("results", {}) or {}
        if results.get("in_database") and results.get("valid"):
            return ThreatHit(source="PhishTank")
    except Exception:
        pass
    return None


async def check_google_safe_browsing(
    url: str, host: str, registrable: str, client: httpx.AsyncClient
) -> Optional[ThreatHit]:
    if not GSB_KEY:
        return None
    try:
        body = {
            "client": {"clientId": "qr-shield", "clientVersion": "1.0"},
            "threatInfo": {
                "threatTypes": [
                    "MALWARE",
                    "SOCIAL_ENGINEERING",
                    "UNWANTED_SOFTWARE",
                    "POTENTIALLY_HARMFUL_APPLICATION",
                ],
                "platformTypes": ["ANY_PLATFORM"],
                "threatEntryTypes": ["URL"],
                "threatEntries": [{"url": url}],
            },
        }
        r = await client.post(
            f"https://safebrowsing.googleapis.com/v4/threatMatches:find?key={GSB_KEY}",
            json=body,
            timeout=5.0,
        )
        data = r.json()
        matches = data.get("matches") or []
        if matches:
            kinds = ", ".join({m.get("threatType", "") for m in matches})
            return ThreatHit(source="Google Safe Browsing", detail=kinds or None)
    except Exception:
        pass
    return None


async def check_alienvault_otx(
    url: str, host: str, registrable: str, client: httpx.AsyncClient
) -> Optional[ThreatHit]:
    if not OTX_KEY:
        return None
    try:
        r = await client.get(
            f"https://otx.alienvault.com/api/v1/indicators/url/{url}/general",
            headers={"X-OTX-API-KEY": OTX_KEY},
            timeout=5.0,
        )
        data = r.json()
        pulse_count = (data.get("pulse_info") or {}).get("count", 0)
        if pulse_count > 0:
            return ThreatHit(
                source="AlienVault OTX",
                detail=f"{pulse_count} threat pulse{'s' if pulse_count != 1 else ''}",
            )
    except Exception:
        pass
    return None


ALL_CHECKS = [
    check_github_phishing,   # local, free, instant
    check_urlhaus,
    check_threatfox,
    check_google_safe_browsing,
    check_phishtank,
    check_alienvault_otx,
]


async def run_all(url: str, host: str, registrable: str) -> list[ThreatHit]:
    """Fire every enabled check in parallel; return all hits found."""
    async with httpx.AsyncClient() as client:
        tasks = [check(url, host, registrable, client) for check in ALL_CHECKS]
        results = await asyncio.gather(*tasks, return_exceptions=True)
    hits: list[ThreatHit] = []
    for r in results:
        if isinstance(r, ThreatHit):
            hits.append(r)
    return hits

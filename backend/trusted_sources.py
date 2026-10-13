"""
Reputation whitelist — "trusted" top-site lists so a scan of wikipedia.org
comes back as `safe` instead of `unknown`.

Sources used (both free, no key, updated daily):

  - Tranco (https://tranco-list.eu) — academic consensus of several existing
    popularity lists. Rank 1 = most popular. Primary source.
  - Majestic Million (https://majestic.com/reports/majestic-million) — top 1M
    by inbound-link count. Fallback / complement.

Rules:
  - Loaded on startup, refreshed every 24h in the background.
  - A domain's registrable form (eTLD+1) in the top TRUSTED_RANK_CUTOFF is
    treated as trusted.
  - Trusted status is advisory — it never overrides a threat-intel hit.
"""

from __future__ import annotations

import asyncio
import csv
import io
import zipfile
from typing import Optional

import httpx


TRUSTED_RANK_CUTOFF = 100_000
REFRESH_INTERVAL_SECONDS = 24 * 3600

TRANCO_URL = "https://tranco-list.eu/top-1m.csv.zip"
MAJESTIC_URL = "https://downloads.majestic.com/majestic_million.csv"


# Domain → best (lowest) rank across sources. Lower = more popular.
_ranks: dict[str, int] = {}
_sources_loaded: dict[str, int] = {}


def _absorb(domain: str, rank: int) -> None:
    domain = domain.lower().strip()
    if not domain or "." not in domain:
        return
    cur = _ranks.get(domain)
    if cur is None or rank < cur:
        _ranks[domain] = rank


async def _load_tranco(client: httpx.AsyncClient) -> int:
    r = await client.get(TRANCO_URL, timeout=120.0, follow_redirects=True)
    if r.status_code != 200:
        return 0
    with zipfile.ZipFile(io.BytesIO(r.content)) as zf:
        name = next(
            (n for n in zf.namelist() if n.lower().endswith(".csv")),
            None,
        )
        if not name:
            return 0
        n = 0
        with zf.open(name) as fh:
            for line in io.TextIOWrapper(fh, encoding="utf-8"):
                parts = line.strip().split(",", 1)
                if len(parts) != 2:
                    continue
                try:
                    rank = int(parts[0])
                except ValueError:
                    continue
                _absorb(parts[1], rank)
                n += 1
        return n


async def _load_majestic(client: httpx.AsyncClient) -> int:
    r = await client.get(MAJESTIC_URL, timeout=120.0)
    if r.status_code != 200:
        return 0
    reader = csv.reader(io.StringIO(r.text))
    header = next(reader, None)
    if not header:
        return 0
    # Column indices: 0=GlobalRank, 2=Domain (schema is stable).
    n = 0
    for row in reader:
        if len(row) < 3:
            continue
        try:
            rank = int(row[0])
        except ValueError:
            continue
        _absorb(row[2], rank)
        n += 1
    return n


async def refresh() -> None:
    global _sources_loaded
    loaded: dict[str, int] = {}
    async with httpx.AsyncClient() as client:
        try:
            loaded["tranco"] = await _load_tranco(client)
        except Exception:
            pass
        try:
            loaded["majestic"] = await _load_majestic(client)
        except Exception:
            pass
    _sources_loaded = loaded


async def start_background_refresh() -> None:
    await refresh()
    while True:
        await asyncio.sleep(REFRESH_INTERVAL_SECONDS)
        try:
            await refresh()
        except Exception:
            pass


def get_rank(domain: str) -> Optional[int]:
    """Return the best rank across sources, or None if not in any list."""
    return _ranks.get(domain.lower())


def is_trusted(domain: str) -> bool:
    rank = get_rank(domain)
    return rank is not None and rank <= TRUSTED_RANK_CUTOFF


def stats() -> dict:
    return {
        "total_domains": len(_ranks),
        "sources": dict(_sources_loaded),
        "cutoff": TRUSTED_RANK_CUTOFF,
    }

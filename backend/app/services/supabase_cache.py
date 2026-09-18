"""Cache persistente en Supabase para las lecturas crudas de Google Sheets.

Reemplaza (complementa) la cache en memoria del proceso: esa se pierde en
cada reinicio del backend, esta sobrevive porque vive en la base de datos.
Usa la REST API de Supabase (PostgREST) directo por HTTP en vez del SDK,
para no sumar una dependencia nueva — el backend ya tiene `requests`.
"""

from datetime import datetime, timezone

import requests

from app.config import SUPABASE_ANON_KEY, SUPABASE_URL

TTL_SECONDS = 300  # 5 minutos — ya no se pierde entre reinicios, se puede estirar sin drama


def _headers(extra: dict | None = None) -> dict:
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Content-Type": "application/json",
    }
    if extra:
        headers.update(extra)
    return headers


def _configurado() -> bool:
    return bool(SUPABASE_URL and SUPABASE_ANON_KEY)


def get(sheet_id: str, worksheet: str) -> list[list[str]] | None:
    """Devuelve los valores cacheados si existen y no vencieron, sino None."""
    if not _configurado():
        return None
    try:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/sheets_cache",
            params={
                "sheet_id": f"eq.{sheet_id}",
                "worksheet": f"eq.{worksheet}",
                "select": "values,updated_at",
            },
            headers=_headers(),
            timeout=10,
        )
        resp.raise_for_status()
        rows = resp.json()
    except requests.RequestException:
        return None

    if not rows:
        return None

    updated_at = datetime.fromisoformat(rows[0]["updated_at"].replace("Z", "+00:00"))
    edad = (datetime.now(timezone.utc) - updated_at).total_seconds()
    if edad > TTL_SECONDS:
        return None
    return rows[0]["values"]


def set(sheet_id: str, worksheet: str, values: list[list[str]]) -> None:
    """Guarda (upsert) los valores de una hoja. No rompe el flujo si falla."""
    if not _configurado():
        return
    try:
        requests.post(
            f"{SUPABASE_URL}/rest/v1/sheets_cache",
            params={"on_conflict": "sheet_id,worksheet"},
            headers=_headers({"Prefer": "resolution=merge-duplicates"}),
            json={
                "sheet_id": sheet_id,
                "worksheet": worksheet,
                "values": values,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            timeout=15,
        )
    except requests.RequestException:
        pass

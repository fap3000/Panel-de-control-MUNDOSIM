"""Guardado persistente de los cierres de caja diarios (tabla cierre_caja_diario
en Supabase). Las hojas 'CAJA' de origen se resetean todos los días, así que
esto es un archivo histórico, no una cache — sin guardarlo acá, el dato de hoy
se pierde en cuanto alguien lo reemplace por el de mañana.

Misma idea que supabase_cache.py: REST API de Supabase por HTTP directo, sin
sumar el SDK como dependencia nueva.
"""

from datetime import date

import requests

from app.config import SUPABASE_ANON_KEY, SUPABASE_URL

_CAMPOS = (
    "transferencias_sistema", "transferencias_real", "transferencias_diferencia",
    "efectivo_sistema", "efectivo_real", "efectivo_diferencia",
    "gastos_sistema", "gastos_real", "gastos_diferencia",
    "total_sistema", "total_real", "total_diferencia",
)


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


def guardar(bloques: list[dict]) -> int:
    """Guarda (upsert por fecha+sucursal+caja) una lista de bloques como los
    que devuelve cierre_caja.get_cierres_del_dia. Devuelve cuántos guardó."""
    if not _configurado() or not bloques:
        return 0
    filas = [
        {
            "fecha": b["fecha"].isoformat(),
            "sucursal": b["sucursal"],
            "caja": b["caja"],
            **{campo: b.get(campo) for campo in _CAMPOS},
        }
        for b in bloques
    ]
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/cierre_caja_diario",
        params={"on_conflict": "fecha,sucursal,caja"},
        headers=_headers({"Prefer": "resolution=merge-duplicates"}),
        json=filas,
        timeout=15,
    )
    resp.raise_for_status()
    return len(filas)


def listar(desde: date, hasta: date) -> list[dict]:
    """Cierres guardados en el rango de fechas (todas las cajas)."""
    if not _configurado():
        return []
    try:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/cierre_caja_diario",
            params={
                "fecha": [f"gte.{desde.isoformat()}", f"lte.{hasta.isoformat()}"],
                "order": "fecha.asc,sucursal.asc,caja.asc",
            },
            headers=_headers(),
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()
    except requests.RequestException:
        return []

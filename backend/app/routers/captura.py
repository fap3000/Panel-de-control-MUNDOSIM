from fastapi import APIRouter, HTTPException

from app.config import CAPTURA_TOKEN, SHEET_CAJA_MDZ_ID, SHEET_CAJA_SJ_ID
from app.services import cierre_caja, cierre_caja_store

router = APIRouter(prefix="/captura", tags=["captura"])


@router.post("/cierre-caja")
def capturar_cierre_caja(token: str):
    """Lee las hojas 'CAJA' de Mdz/SJ (hoy) y las guarda en Supabase antes de que
    se pisen mañana. Pensado para dispararse desde un cron externo ~20:30/21hs,
    no desde el frontend — por eso el token en vez de auth de usuario."""
    if not CAPTURA_TOKEN or token != CAPTURA_TOKEN:
        raise HTTPException(status_code=403, detail="Token inválido")
    try:
        bloques = cierre_caja.get_cierres_del_dia(SHEET_CAJA_MDZ_ID, "Mendoza") + cierre_caja.get_cierres_del_dia(
            SHEET_CAJA_SJ_ID, "San Juan"
        )
        guardados = cierre_caja_store.guardar(bloques)
        return {"guardados": guardados, "bloques": bloques}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"No se pudo capturar el cierre de caja: {exc}") from exc

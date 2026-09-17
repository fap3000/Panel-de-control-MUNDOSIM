from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import FRONTEND_ORIGIN
from app.routers import compras, ventas

app = FastAPI(title="Tablero Integral - API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(compras.router)
app.include_router(ventas.router)


@app.get("/health")
def health():
    return {"status": "ok"}

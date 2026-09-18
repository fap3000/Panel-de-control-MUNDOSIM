import os

from dotenv import load_dotenv

load_dotenv(".env.local")
load_dotenv(".env")

# En local: ruta a un archivo JSON. En producción (Render) no hay forma cómoda
# de "subir" un archivo, así que ahí se usa GOOGLE_SERVICE_ACCOUNT_JSON con el
# contenido completo del JSON pegado como variable de entorno.
GOOGLE_SERVICE_ACCOUNT_FILE = os.environ.get("GOOGLE_SERVICE_ACCOUNT_FILE", "service_account.json")
GOOGLE_SERVICE_ACCOUNT_JSON = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON", "")

TRELLO_API_KEY = os.environ.get("TRELLO_API_KEY", "")
TRELLO_TOKEN = os.environ.get("TRELLO_TOKEN", "")
TRELLO_BOARD_ID = os.environ.get("TRELLO_BOARD_ID", "13mAq7FN")

SHEET_CONSOLIDADO_ID = os.environ.get("SHEET_CONSOLIDADO_ID", "1OnR7GPTcbMyX_9QlZBGf88PXCbJAx9a1R3hHsWvyaYQ")
SHEET_PAGOS_PROVEEDORES_ID = os.environ.get("SHEET_PAGOS_PROVEEDORES_ID", "1O3OlWTxWDacM19KzYnOZMtFi9s1aZgO8iq_Cq4m4c7E")

# Uno o más orígenes separados por coma (ej. "https://tablero.vercel.app,http://localhost:5173")
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "http://localhost:5173")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")

import os

from dotenv import load_dotenv

load_dotenv(".env.local")
load_dotenv(".env")

GOOGLE_SERVICE_ACCOUNT_FILE = os.environ.get("GOOGLE_SERVICE_ACCOUNT_FILE", "service_account.json")

TRELLO_API_KEY = os.environ.get("TRELLO_API_KEY", "")
TRELLO_TOKEN = os.environ.get("TRELLO_TOKEN", "")
TRELLO_BOARD_ID = os.environ.get("TRELLO_BOARD_ID", "13mAq7FN")

SHEET_CONSOLIDADO_ID = os.environ.get("SHEET_CONSOLIDADO_ID", "1OnR7GPTcbMyX_9QlZBGf88PXCbJAx9a1R3hHsWvyaYQ")
SHEET_PAGOS_PROVEEDORES_ID = os.environ.get("SHEET_PAGOS_PROVEEDORES_ID", "1O3OlWTxWDacM19KzYnOZMtFi9s1aZgO8iq_Cq4m4c7E")

FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173")

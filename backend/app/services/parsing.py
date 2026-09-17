import re


def parse_amount(value: str) -> float:
    """Convierte un monto en formato argentino ('$ 1.234,56', '90500', '-25.328,00') a float."""
    if not value:
        return 0.0
    v = value.strip()
    negative = v.startswith("-")
    v = re.sub(r"[^0-9.,]", "", v)
    if not v:
        return 0.0
    if "," in v:
        v = v.replace(".", "").replace(",", ".")
    elif "." in v:
        v = v.replace(".", "")
    try:
        num = float(v)
    except ValueError:
        return 0.0
    return -num if negative else num

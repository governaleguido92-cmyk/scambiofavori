"""HTTPS landing pages Stripe redirects to after checkout; they hand the user back to the mobile app."""
import re
from html import escape

from fastapi import APIRouter, Query
from fastapi.responses import HTMLResponse

# No /api prefix: these URLs are built by the checkout endpoint as "<origin>/supporter[/success]".
api_router = APIRouter()

APP_DEEP_LINK = "scambiodifavori://supporter"
STRIPE_SESSION_ID = re.compile(r"^[A-Za-z0-9_]{1,200}$")
PAGE_HEADERS = {
    "Cache-Control": "no-store",
    "X-Frame-Options": "DENY",
    "X-Robots-Tag": "noindex",
}

PAGE = """<!doctype html>
<html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="0;url={link}">
<title>Scambio di Favori</title>
<style>body{{font-family:system-ui,sans-serif;text-align:center;padding:3rem 1.5rem}}
a{{display:inline-block;margin-top:1.5rem;padding:.8rem 1.6rem;border-radius:.6rem;background:#1f6f5c;color:#fff;text-decoration:none}}</style>
</head><body><h1>{title}</h1><p>{message}</p>
<a href="{link}">Torna all'app</a></body></html>"""


def _page(title: str, message: str, link: str) -> HTMLResponse:
    body = PAGE.format(title=escape(title), message=escape(message), link=escape(link, quote=True))
    return HTMLResponse(body, headers=PAGE_HEADERS)


@api_router.get("/supporter/success", include_in_schema=False)
async def supporter_checkout_success(session_id: str = Query("", max_length=300)):
    """Stripe success_url. Only a well-formed session id is passed on to the app."""
    link = f"{APP_DEEP_LINK}?session_id={session_id}" if STRIPE_SESSION_ID.match(session_id) else APP_DEEP_LINK
    return _page("Pagamento ricevuto", "Ti riportiamo nell'app per confermare il tuo supporto.", link)


@api_router.get("/supporter", include_in_schema=False)
async def supporter_checkout_cancelled():
    """Stripe cancel_url."""
    return _page("Pagamento annullato", "Nessun addebito. Puoi tornare all'app e riprovare quando vuoi.", APP_DEEP_LINK)

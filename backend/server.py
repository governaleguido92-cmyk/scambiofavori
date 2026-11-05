"""FastAPI application entrypoint: wires routers, static files, CORS and shutdown."""
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from core import *  # noqa: F401,F403
from core import _rate_limit_exceeded_handler  # noqa: F401
from routers import ROUTERS

# Create the main app
app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request, exc: RequestValidationError):
    """422 senza il valore inviato: un NaN o un testo enorme nel body non deve rompere (o gonfiare) la risposta d'errore."""
    errors = [{"loc": list(err.get("loc", [])), "msg": err.get("msg", ""), "type": err.get("type", "")} for err in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": errors})

# Root endpoint for health checks (Kubernetes probes)
@app.get("/")
async def root():
    return {"status": "healthy", "app": "Scambio Favori API"}

# Include routers
for _router in ROUTERS:
    app.include_router(_router)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_PATH)), name="uploads")
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Email-Unverified", "X-User-Id", "X-Phone-Required", "X-Debt-Block", "X-Debt-Limit"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

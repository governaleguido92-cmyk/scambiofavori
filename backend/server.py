"""FastAPI application entrypoint: wires routers, static files, CORS and shutdown."""
from core import *  # noqa: F401,F403
from core import _rate_limit_exceeded_handler  # noqa: F401
from routers import ROUTERS

# Create the main app
app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

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
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

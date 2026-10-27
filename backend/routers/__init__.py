from routers.auth_routes import api_router as auth_routes_router
from routers.favors_routes import api_router as favors_routes_router
from routers.community_routes import api_router as community_routes_router
from routers.users_routes import api_router as users_routes_router
from routers.payments_routes import api_router as payments_routes_router
from routers.notifications_routes import api_router as notifications_routes_router
from routers.health_routes import api_router as health_routes_router

ROUTERS = [auth_routes_router, favors_routes_router, community_routes_router, users_routes_router, payments_routes_router, notifications_routes_router, health_routes_router]

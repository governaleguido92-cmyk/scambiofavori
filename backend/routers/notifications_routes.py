"""HTTP routes: notifications."""
from fastapi import APIRouter
from core import *  # noqa: F401,F403

api_router = APIRouter(prefix="/api")

@api_router.get("/notifications")
async def get_notifications(current_user: User = Depends(get_current_user)):
    """Get user's notifications"""
    notifications = await db.notifications.find(
        {"user_id": current_user.user_id},
        {"_id": 0}
    ).sort("created_at", -1).limit(50).to_list(50)
    return notifications

@api_router.post("/notifications/read/{notification_id}")
async def mark_notification_read(notification_id: str, current_user: User = Depends(get_current_user)):
    """Mark notification as read"""
    await db.notifications.update_one(
        {"notification_id": notification_id, "user_id": current_user.user_id},
        {"$set": {"read": True}}
    )
    return {"message": "Notifica segnata come letta"}

@api_router.get("/notifications/unread-count")
async def get_unread_count(current_user: User = Depends(get_current_user)):
    """Get count of unread notifications"""
    count = await db.notifications.count_documents({
        "user_id": current_user.user_id,
        "read": False
    })
    return {"unread_count": count}

@api_router.post("/push-token")
async def register_push_token(data: PushTokenRequest, current_user: User = Depends(get_current_user)):
    """Register or update user's Expo push token"""
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": {"push_token": data.push_token, "push_token_updated": datetime.now(timezone.utc)}}
    )
    logger.info(f"Push token registered for user {current_user.user_id}")
    return {"message": "Push token registrato"}

@api_router.delete("/push-token")
async def remove_push_token(current_user: User = Depends(get_current_user)):
    """Remove user's push token (on logout)"""
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$unset": {"push_token": "", "push_token_updated": ""}}
    )
    return {"message": "Push token rimosso"}

@api_router.get("/notification-preferences")
async def get_notification_preferences(current_user: User = Depends(get_current_user)):
    """Get user's notification preferences"""
    user_doc = await db.users.find_one(
        {"user_id": current_user.user_id},
        {"_id": 0, "notification_preferences": 1}
    )
    defaults = {
        "favor_accepted": True,
        "favor_completed": True,
        "new_message": True,
        "new_review": True,
        "skill_match": True,
    }
    prefs = user_doc.get("notification_preferences", defaults) if user_doc else defaults
    return {**defaults, **prefs}

@api_router.put("/notification-preferences")
async def update_notification_preferences(prefs: NotificationPreferences, current_user: User = Depends(get_current_user)):
    """Update user's notification preferences"""
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": {"notification_preferences": prefs.dict()}}
    )
    return {"message": "Preferenze aggiornate", "preferences": prefs.dict()}

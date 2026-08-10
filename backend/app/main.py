from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from .database import Base, engine, SessionLocal
from . import models  # noqa: F401  (register models)
from .routers import auth, requests, analytics, chat, documents, audit
from .models.agent_run import AgentRun
from .models.pa_request import PARequest
from .models.user import User
from .models.refresh_token import RefreshToken
from .security import create_access_token
from .logging_config import setup_logging
from jose import jwt, JWTError
from sqlalchemy import text
import asyncio
import logging
import uuid

setup_logging()
logger = logging.getLogger(__name__)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="InsurCare AI API", version="1.0.0")

# ── Request ID middleware for tracing ──────────────────────────────────────────
@app.middleware("http")
async def add_request_id(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", uuid.uuid4().hex[:12])
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(requests.router)
app.include_router(analytics.router)
app.include_router(chat.router)
app.include_router(documents.router)
app.include_router(audit.router)

@app.get("/")
def root():
    return {"service": "InsurCare AI API", "status": "ok"}

@app.get("/health")
def health():
    db_ok = False
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        pass
    finally:
        db.close()
    return {
        "status": "healthy" if db_ok else "degraded",
        "database": "connected" if db_ok else "unreachable",
        "version": "1.0.0",
    }


# Track active WebSocket connections to prevent DB overload
_active_ws_connections: int = 0
_MAX_WS_CONNECTIONS: int = 20  # At 1 query/3s each, this caps at 400 DB queries/min
_WS_POLL_INTERVAL: float = 3.0


@app.websocket("/ws/agent-runs")
async def websocket_agent_runs(websocket: WebSocket, token: str = Query(...)):
    global _active_ws_connections

    # Validate JWT token
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        user_id = int(payload.get("sub", 0))
    except JWTError:
        await websocket.close(code=1008, reason="Invalid token")
        return

    db_auth = SessionLocal()
    try:
        user = db_auth.query(User).filter(User.id == user_id).first()
        if not user:
            await websocket.close(code=1008, reason="User not found")
            return
    finally:
        db_auth.close()

    if _active_ws_connections >= _MAX_WS_CONNECTIONS:
        await websocket.close(code=1008, reason="Too many concurrent connections")
        logger.warning("WebSocket connection rejected: limit of %d reached", _MAX_WS_CONNECTIONS)
        return

    _active_ws_connections += 1
    logger.debug("WebSocket connected (active: %d) user=%s role=%s", _active_ws_connections, user.email, user.role)

    try:
        await websocket.accept()
        consecutive_errors = 0

        while True:
            db = SessionLocal()
            try:
                query = db.query(AgentRun).join(PARequest, AgentRun.request_id == PARequest.id)

                if user.role == "hospital":
                    if user.hospital:
                        hospital_user_ids = [
                            u.id for u in db.query(User).filter(
                                User.role == "hospital",
                                User.hospital == user.hospital
                            ).all()
                        ]
                        query = query.filter(PARequest.user_id.in_(hospital_user_ids)) if hospital_user_ids else query.filter(False)
                    else:
                        query = query.filter(False)
                elif user.role == "insurer":
                    if user.company_name:
                        query = query.filter(PARequest.insurance_provider == user.company_name)
                    else:
                        query = query.filter(False)

                runs = query.order_by(AgentRun.started_at.desc()).limit(20).all()
                payload = [
                    {
                        "id": r.id,
                        "request_id": r.request_id,
                        "agent_id": r.agent_id,
                        "status": r.status,
                        "confidence": r.confidence,
                        "duration_ms": r.duration_ms,
                    }
                    for r in runs
                ]
                await websocket.send_json(payload)
                consecutive_errors = 0
            except WebSocketDisconnect:
                break
            except Exception as e:
                consecutive_errors += 1
                logger.warning("WebSocket poll error #%d: %s", consecutive_errors, e)
                if consecutive_errors >= 5:
                    logger.error("WebSocket closing after %d consecutive errors", consecutive_errors)
                    break
                backoff = min(30.0, _WS_POLL_INTERVAL * (2 ** (consecutive_errors - 1)))
                await asyncio.sleep(backoff)
                continue
            finally:
                db.close()

            await asyncio.sleep(_WS_POLL_INTERVAL)

    except Exception:
        pass
    finally:
        _active_ws_connections -= 1
        logger.debug("WebSocket disconnected (active: %d)", _active_ws_connections)
        try:
            await websocket.close()
        except Exception:
            pass


import socketio

# Create a Socket.IO server with CORS settings that match your frontend
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins=['http://localhost:5173'], # TODO: Use settings from config.py
    logger=True,
    engineio_logger=True
)

# Wrap with ASGI application
socket_app = socketio.ASGIApp(sio)

# Socket.IO event handlers
@sio.event
async def connect(sid, environ):
    print(f"Socket.IO client connected: {sid}")
    return {"status": "connected"}

@sio.event
async def disconnect(sid):
    print(f"Socket.IO client disconnected: {sid}")

@sio.event
async def join(sid, data):
    """Join a session room for real-time updates"""
    session_id = data
    print(f"Client {sid} joining room {session_id}")
    await sio.enter_room(sid, session_id)
    return {"status": "joined"}

@sio.event
async def leave(sid, data):
    """Leave a session room"""
    session_id = data
    print(f"Client {sid} leaving room {session_id}")
    await sio.leave_room(sid, session_id)
    return {"status": "left"}

# Optional: Define a helper for emitting if needed elsewhere, though direct sio.emit is often fine
# async def emit_to_room(event, data, room):
#     print(f"Emitting {event} to room {room}")
#     await sio.emit(event, data, room=room)
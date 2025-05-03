from slowapi import Limiter
from slowapi.util import get_remote_address
from app.core.config import settings 

# Function to get the remote address for rate limiting key
def key_func(request):
    return get_remote_address(request)

# Initialize the limiter instance here
limiter = Limiter(key_func=key_func, default_limits=[settings.DEFAULT_RATE_LIMIT])
import os
import asyncio
from redis import asyncio as aioredis
from typing import Optional, Dict, Any
import logging
import json
import time
from collections import defaultdict

logger = logging.getLogger(__name__)

_redis = None
_fallback_storage = defaultdict(list)  # In-memory fallback for development

class RedisFallback:
    """In-memory Redis fallback for development when Redis is not available"""

    def __init__(self):
        self.storage = defaultdict(list)
        self.key_values = {}

    async def lpush(self, key: str, value: str) -> int:
        """Add value to the left of the list"""
        self.storage[key].insert(0, value)
        return len(self.storage[key])

    async def brpop(self, key: str, timeout: float = 0) -> Optional[tuple]:
        """Remove and return the rightmost element from the list"""
        if self.storage[key]:
            value = self.storage[key].pop()
            return (key, value)
        return None

    async def exists(self, key: str) -> bool:
        """Check if key exists"""
        return key in self.key_values

    async def get(self, key: str) -> Optional[str]:
        """Get value by key"""
        return self.key_values.get(key)

    async def setex(self, key: str, time: int, value: str) -> bool:
        """Set key with expiration"""
        self.key_values[key] = value
        return True

    async def delete(self, key: str) -> int:
        """Delete key"""
        if key in self.key_values:
            del self.key_values[key]
            return 1
        return 0

    async def keys(self, pattern: str) -> list:
        """Get keys matching pattern"""
        if pattern.endswith('*'):
            prefix = pattern[:-1]
            return [k for k in self.key_values.keys() if k.startswith(prefix)]
        return []

    async def ttl(self, key: str) -> int:
        """Get time to live (always return -1 for fallback)"""
        return -1

    async def expire(self, key: str, seconds: int) -> bool:
        """Set expiration (no-op for fallback)"""
        return True

async def get_redis():
    """Get Redis connection with fallback for development."""
    global _redis
    if _redis is None:
        redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
        try:
            _redis = await aioredis.from_url(
                redis_url,
                # Million-user connection pool settings
                max_connections=500,  # Support massive concurrent connections
                retry_on_timeout=True,
                retry_on_error=[ConnectionError, TimeoutError],
                health_check_interval=30,
                # Optimize for maximum throughput
                socket_keepalive=True,
                socket_keepalive_options={},
                # Aggressive connection timeouts for high performance
                socket_connect_timeout=2,  # Shorter timeout for faster fallback
                socket_timeout=2,
            )
            # Test the connection
            await _redis.ping()
            logger.info("Redis connection established successfully")
        except Exception as e:
            logger.warning(f"Redis connection failed ({e}), using in-memory fallback for development")
            _redis = RedisFallback()
    return _redis

# Legacy queue functions removed - now using optimized batch processor
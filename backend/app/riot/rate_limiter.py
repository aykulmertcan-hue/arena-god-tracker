import asyncio
import time
from collections import deque
from typing import Callable


class SlidingWindowLimiter:
    """Pure, time-injected sliding-window limiter over multiple windows."""

    def __init__(self, limits: list[tuple[int, float]]):
        # limits: list of (max_requests, per_seconds)
        self.limits = limits
        self._timestamps: deque[float] = deque()

    def _prune(self, now: float) -> None:
        max_window = max(per for _, per in self.limits)
        while self._timestamps and self._timestamps[0] <= now - max_window:
            self._timestamps.popleft()

    def time_until_available(self, now: float) -> float:
        self._prune(now)
        wait = 0.0
        for max_req, per in self.limits:
            relevant = [t for t in self._timestamps if t > now - per]
            if len(relevant) >= max_req:
                wait = max(wait, relevant[0] + per - now)
        return wait

    def record(self, now: float) -> None:
        self._timestamps.append(now)


class AsyncRateLimiter:
    """Async wrapper around SlidingWindowLimiter, serialized by a lock."""

    def __init__(
        self,
        limits: list[tuple[int, float]],
        clock: Callable[[], float] = time.monotonic,
        sleep=asyncio.sleep,
    ):
        self._core = SlidingWindowLimiter(limits)
        self._clock = clock
        self._sleep = sleep
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            while True:
                now = self._clock()
                wait = self._core.time_until_available(now)
                if wait <= 0:
                    self._core.record(now)
                    return
                await self._sleep(wait)

    async def sleep(self, seconds: float) -> None:
        await self._sleep(seconds)

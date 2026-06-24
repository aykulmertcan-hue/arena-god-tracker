from app.riot.rate_limiter import SlidingWindowLimiter


def test_allows_until_limit_then_requires_wait():
    lim = SlidingWindowLimiter([(2, 10.0)])  # 2 requests per 10s
    assert lim.time_until_available(now=0.0) == 0.0
    lim.record(0.0)
    assert lim.time_until_available(now=0.0) == 0.0
    lim.record(0.0)
    # third request must wait until the first ages out (t=10)
    assert lim.time_until_available(now=0.0) == 10.0


def test_window_slides_as_time_passes():
    lim = SlidingWindowLimiter([(2, 10.0)])
    lim.record(0.0)
    lim.record(0.0)
    # at t=10 the first two have aged out
    assert lim.time_until_available(now=10.0) == 0.0


def test_two_windows_take_the_stricter_wait():
    lim = SlidingWindowLimiter([(20, 1.0), (3, 120.0)])  # 20/s AND 3/120s
    for _ in range(3):
        lim.record(0.0)
    # per-second window is fine, but 3/120s is exhausted -> wait ~120s
    assert lim.time_until_available(now=0.5) == 119.5

import pytest
from app.riot.routing import resolve_routing, SERVERS


def test_known_servers_map_to_regional_routing():
    assert resolve_routing("TR1") == ("europe", "tr1")
    assert resolve_routing("euw1") == ("europe", "euw1")
    assert resolve_routing("NA1") == ("americas", "na1")
    assert resolve_routing("KR") == ("asia", "kr")


def test_unknown_server_raises():
    with pytest.raises(ValueError):
        resolve_routing("ZZZ")


def test_servers_list_nonempty_and_uppercase():
    assert "TR1" in SERVERS
    assert all(s == s.upper() for s in SERVERS)

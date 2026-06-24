SERVER_TO_ROUTING: dict[str, tuple[str, str]] = {
    "EUW1": ("europe", "euw1"),
    "EUN1": ("europe", "eun1"),
    "TR1": ("europe", "tr1"),
    "RU": ("europe", "ru"),
    "NA1": ("americas", "na1"),
    "BR1": ("americas", "br1"),
    "LA1": ("americas", "la1"),
    "LA2": ("americas", "la2"),
    "OC1": ("americas", "oc1"),
    "KR": ("asia", "kr"),
    "JP1": ("asia", "jp1"),
}

SERVERS: list[str] = list(SERVER_TO_ROUTING.keys())


def resolve_routing(server: str) -> tuple[str, str]:
    key = server.upper()
    if key not in SERVER_TO_ROUTING:
        raise ValueError(f"Unknown server: {server}")
    return SERVER_TO_ROUTING[key]

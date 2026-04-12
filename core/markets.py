"""Global market definitions — 12 regions covering 72 countries.

Replaces the old 4-market system (kr/us/jp/br) with a comprehensive
global market map. Each region has distinct musical characteristics
that the classifier can learn from.
"""

# ─── 12 Market Regions ───
MARKETS = {
    "kr": "한국",
    "us": "북미",
    "jp": "일본",
    "br": "브라질",
    "latam": "라틴아메리카",
    "sea": "동남아시아",
    "europe": "유럽",
    "uk": "영국/아일랜드",
    "mena": "중동/북아프리카",
    "africa": "아프리카",
    "india": "인도/남아시아",
    "china": "중화권",
}

# Human-readable with flags
MARKET_DISPLAY = {
    "kr": {"name": "한국", "flag": "🇰🇷", "cue": "초정밀 훅 프레셔, 장르 하이브리드"},
    "us": {"name": "북미", "flag": "🇺🇸", "cue": "스트리밍 최적화, TikTok 바이럴"},
    "jp": {"name": "일본", "flag": "🇯🇵", "cue": "멜로디 복잡도, 애니 타이업"},
    "br": {"name": "브라질", "flag": "🇧🇷", "cue": "Funk/Sertanejo, 리듬 중심"},
    "latam": {"name": "라틴아메리카", "flag": "🌎", "cue": "레게톤, 바차타, Regional Mexican"},
    "sea": {"name": "동남아시아", "flag": "🌏", "cue": "K-pop 팬덤, P-pop, T-pop 부상"},
    "europe": {"name": "유럽", "flag": "🇪🇺", "cue": "EDM 강세, 다국어 크로스오버"},
    "uk": {"name": "영국/아일랜드", "flag": "🇬🇧", "cue": "Grime, Drill, 인디팝"},
    "mena": {"name": "중동/북아프리카", "flag": "🌍", "cue": "아랍팝, Mahraganat, Khaleeji"},
    "africa": {"name": "아프리카", "flag": "🌍", "cue": "Afrobeats, Amapiano, Bongo Flava"},
    "india": {"name": "인도/남아시아", "flag": "🇮🇳", "cue": "볼리우드, Punjabi pop, Indie"},
    "china": {"name": "중화권", "flag": "🇨🇳", "cue": "C-pop, Mandopop, 캔토팝"},
}

# Country code → Market region mapping
COUNTRY_TO_MARKET = {
    # Korea
    "KR": "kr",

    # North America
    "US": "us", "CA": "us",

    # Japan
    "JP": "jp",

    # Brazil
    "BR": "br",

    # Latin America (non-Brazil)
    "MX": "latam", "CO": "latam", "AR": "latam", "CL": "latam",
    "PE": "latam", "EC": "latam", "VE": "latam", "DO": "latam",
    "PA": "latam", "CR": "latam", "GT": "latam", "HN": "latam",
    "SV": "latam", "NI": "latam", "UY": "latam", "PY": "latam",
    "BO": "latam", "ES": "latam", "PT": "latam",

    # Southeast Asia
    "SG": "sea", "MY": "sea", "TH": "sea", "PH": "sea",
    "ID": "sea", "VN": "sea",

    # Europe (continental)
    "DE": "europe", "FR": "europe", "IT": "europe", "NL": "europe",
    "BE": "europe", "AT": "europe", "CH": "europe", "SE": "europe",
    "NO": "europe", "DK": "europe", "FI": "europe", "PL": "europe",
    "CZ": "europe", "SK": "europe", "HU": "europe", "RO": "europe",
    "BG": "europe", "GR": "europe", "LT": "europe", "LV": "europe",
    "EE": "europe", "LU": "europe", "IS": "europe", "UA": "europe",
    "BY": "europe",

    # UK & Ireland
    "GB": "uk", "IE": "uk", "AU": "uk", "NZ": "uk",

    # Middle East / North Africa
    "AE": "mena", "SA": "mena", "EG": "mena", "MA": "mena",
    "TR": "mena", "IL": "mena",

    # Africa (sub-Saharan)
    "NG": "africa", "ZA": "africa", "KE": "africa", "GH": "africa",

    # India / South Asia
    "IN": "india", "PK": "india",

    # Greater China
    "TW": "china", "HK": "china",

    # Central Asia
    "KZ": "europe",
}

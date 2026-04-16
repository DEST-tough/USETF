"""공통 유틸: Yahoo Finance 데이터 fetch + 지표 계산"""
import yfinance as yf
import numpy as np

def _col(df, name: str):
    """멀티컬럼/단일컬럼 모두 대응해서 Series 반환"""
    col = df[name]
    if hasattr(col, "squeeze"):
        col = col.squeeze()
    return col

def fetch(symbol: str, period: str = "2y") -> list[float]:
    """종목 일봉 종가 리스트 반환 (오래된→최신 순서)"""
    df = yf.download(symbol, period=period, progress=False, auto_adjust=True)
    return _col(df, "Close").dropna().tolist()

def fetch_ohlc(symbol: str, period: str = "2y"):
    """OHLC bars 반환 (ATR 계산용)"""
    df = yf.download(symbol, period=period, progress=False, auto_adjust=True)
    df = df.dropna()
    c = _col(df, "Close").tolist()
    h = _col(df, "High").tolist()
    l = _col(df, "Low").tolist()
    return [{"c": c[i], "h": h[i], "l": l[i]} for i in range(len(c))]

def fetch_price(symbol: str) -> float:
    """현재가"""
    t = yf.Ticker(symbol)
    return t.fast_info.last_price

def calc_ma(arr: list, n: int) -> float | None:
    if len(arr) < n:
        return None
    return sum(arr[-n:]) / n

def calc_rsi(closes: list, period: int = 14) -> float | None:
    if len(closes) < period + 1:
        return None
    diffs = [closes[i] - closes[i-1] for i in range(len(closes)-period, len(closes))]
    gains  = sum(d for d in diffs if d > 0)
    losses = sum(-d for d in diffs if d < 0)
    avg_gain  = gains / period
    avg_loss  = losses / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100 - 100 / (1 + rs)

def calc_vol_ann(closes: list, n: int = 20) -> float | None:
    if len(closes) < n + 1:
        return None
    rets = [np.log(closes[i] / closes[i-1]) for i in range(len(closes)-n, len(closes))]
    return float(np.std(rets) * np.sqrt(252))

def calc_atr(bars: list, n: int = 10) -> float | None:
    if len(bars) < n + 1:
        return None
    sl = bars[-(n+1):]
    trs = []
    for i in range(1, n+1):
        h, l, pc = sl[i]["h"], sl[i]["l"], sl[i-1]["c"]
        trs.append(max(h - l, abs(h - pc), abs(l - pc)))
    return sum(trs) / n

def calc_bb_lower(closes: list, n: int = 20) -> float | None:
    if len(closes) < n:
        return None
    sl = closes[-n:]
    mean = sum(sl) / n
    std  = np.std(sl)
    return mean - 2 * std

def calc_dd(closes: list, n: int = 252) -> float:
    sl = closes[-min(n, len(closes)):]
    peak = max(sl)
    if peak == 0:
        return 0.0
    return (closes[-1] - peak) / peak

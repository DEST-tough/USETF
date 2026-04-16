"""UPRO 신호: MA210 + VIX22 + 모멘텀DCA + ATR(10d×3.0) 트레일링 스탑"""
from .base import fetch, fetch_ohlc, calc_ma, calc_atr

MA_WIN      = 210
VIX_THRESH  = 22.0
POS_CAUTION = 0.79
COOLDOWN    = 6
ATR_N       = 10
ATR_MULT    = 3.0
ATR_PEAK_WIN = 60

def _calc_dca_mult(mom1m: float, mom3m: float, ma_dist: float) -> float:
    mom = mom1m * 0.5 + mom3m * 0.5
    if mom > 0.05:   base = 2.0
    elif mom > 0.02: base = 1.5
    elif mom > 0:    base = 1.0
    elif mom > -0.05:base = 0.75
    else:            base = 0.5

    if ma_dist > 0.05:   adj = 1.0
    elif ma_dist > 0:    adj = 0.9
    elif ma_dist > -0.05:adj = 0.8
    else:                adj = 0.5

    return round(base * adj * 2) / 2  # 0.5 단위

def _simulate(spy_bars: list, vix_c: list) -> dict:
    n    = min(len(spy_bars), len(vix_c))
    spy  = spy_bars[-min(n, 500):]
    vix  = vix_c[-min(n, 500):]
    spy_c = [b["c"] for b in spy]

    pos = 0; last_change = -999; peak = 0; forced_out = False

    for i in range(MA_WIN, len(spy)):
        c      = spy[i]["c"]
        ma210  = calc_ma(spy_c[:i+1], MA_WIN)
        vix_now = vix[i]
        atr10  = calc_atr(spy[:i+1], ATR_N)
        if not all([ma210, vix_now, atr10]):
            continue

        above_ma = c > ma210
        vix_safe = vix_now < VIX_THRESH

        if above_ma and vix_safe:       base = 1.0
        elif above_ma or vix_safe:      base = POS_CAUTION
        else:                           base = 0.0

        can_change = (i - last_change) >= COOLDOWN
        if pos > 0 or base > 0: peak = max(peak, c)
        stop_line = peak - atr10 * ATR_MULT

        if not forced_out:
            if pos > 0 and c < stop_line:
                forced_out = True; pos = 0; peak = 0; last_change = i
            elif can_change and base != pos:
                pos = base; last_change = i
        else:
            if base > 0 and c > stop_line * 1.02:
                forced_out = False; peak = c
            if not forced_out and can_change and base != pos:
                pos = base; last_change = i
            elif forced_out:
                pos = 0

    return {"pos": pos, "peak": peak, "forced_out": forced_out}

def get_signal() -> dict:
    spy_bars = fetch_ohlc("SPY",  "2y")
    vix_c    = fetch("^VIX",      "2y")
    upro_c   = fetch("UPRO",      "1y")

    spy_c  = [b["c"] for b in spy_bars]
    spy_price = spy_c[-1]
    upro_price = upro_c[-1]
    vix_now   = vix_c[-1]
    ma210     = calc_ma(spy_c, MA_WIN)
    atr10     = calc_atr(spy_bars, ATR_N)

    above_ma = spy_price > ma210
    vix_safe = vix_now < VIX_THRESH
    ma_pct   = (spy_price - ma210) / ma210 * 100 if ma210 else 0

    # ATR 스탑
    recent_spy = spy_c[-ATR_PEAK_WIN:]
    peak       = max(recent_spy)
    stop_line  = peak - atr10 * ATR_MULT if atr10 else None
    atr_safe   = spy_price > stop_line if stop_line else True
    dd_from_peak = (spy_price - peak) / peak * 100
    buffer_pct   = (spy_price - stop_line) / spy_price * 100 if stop_line else None

    # 모멘텀 DCA
    mom1m  = (spy_price / spy_c[-22]  - 1) if len(spy_c) > 21  else 0
    mom3m  = (spy_price / spy_c[-64]  - 1) if len(spy_c) > 63  else 0
    ma200  = calc_ma(spy_c, 200)
    ma_dist200 = (spy_price - ma200) / ma200 if ma200 else 0
    dca_mult = _calc_dca_mult(mom1m, mom3m, ma_dist200)

    sim = _simulate(spy_bars, vix_c)
    pos = 0 if sim["forced_out"] else sim["pos"]

    if sim["forced_out"]:    signal = "STOP"
    elif pos == 1.0:         signal = "LONG"
    elif pos > 0:            signal = "CAUTION"
    else:                    signal = "CASH"

    upro_weight = round(pos * 100)

    lines = []
    if signal == "LONG":
        lines.append(f"SPY MA210 위 (${spy_price:.2f} > ${ma210:.2f})")
        lines.append(f"VIX {vix_now:.1f} < {VIX_THRESH}")
        lines.append(f"ATR 스탑 안전 (버퍼 {buffer_pct:.1f}%)" if buffer_pct else "ATR 스탑 안전")
        lines.append(f"DCA 배수 {dca_mult:.1f}x (모멘텀 {mom1m*100:.1f}%)")
    elif signal == "CAUTION":
        lines.append(f"주의 포지션 {upro_weight}%")
        if not above_ma: lines.append(f"SPY MA210 아래 ({ma_pct:.1f}%)")
        if not vix_safe: lines.append(f"VIX {vix_now:.1f} >= {VIX_THRESH}")
    elif signal == "STOP":
        lines.append("⚠️ ATR 트레일링 스탑 발동!")
        lines.append(f"SPY 고점 ${peak:.2f} → 스탑 ${stop_line:.2f}" if stop_line else "스탑 발동")
    else:
        if not above_ma: lines.append(f"SPY MA210 아래 (${spy_price:.2f} < ${ma210:.2f})")
        if not vix_safe: lines.append(f"VIX {vix_now:.1f} >= {VIX_THRESH}")
        lines.append("전량 현금 보유")

    emoji_map = {"LONG": "📈", "CAUTION": "⚠️", "STOP": "🚨", "CASH": "💵"}

    return {
        "name":   "UPRO",
        "signal": signal,
        "weight": upro_weight,
        "price":  upro_price,
        "detail": lines,
        "emoji":  emoji_map.get(signal, "💵"),
    }

"""TQQQ v8 신호: MA200 + RSI75 + 변동성타깃σ=60% + 재진입MA20"""
from .base import fetch, calc_ma, calc_rsi, calc_vol_ann

STOP        = 0.18
FAST_MA     = 20
TARGET_VOL  = 0.60
RSI_THRESH  = 75

def _simulate(tqqq: list, qqq: list) -> dict:
    n    = min(len(tqqq), len(qqq))
    tq   = tqqq[-min(n, 240):]
    qq   = qqq[-min(n, 240):]
    pos  = 0; peak = 0; entry = 0; ever_exited = False; days = 0

    for i in range(200, len(tq)):
        c        = tq[i]
        ma200    = calc_ma(tq[:i+1], 200)
        ma20     = calc_ma(tq[:i+1], FAST_MA)
        rsi      = calc_rsi(tq[:i+1], 14)
        vol      = calc_vol_ann(tq[:i+1], 20)
        qqq_ma200 = calc_ma(qq[:i+1], 200)
        if not all([ma200, ma20, rsi, vol, qqq_ma200]):
            continue

        above_ma200 = c > ma200
        qqq_ok      = qq[i] > qqq_ma200
        rsi_ok      = rsi < RSI_THRESH

        if pos == 0:
            if above_ma200 and rsi_ok:
                pos = 1; peak = c; entry = c; ever_exited = False; days = 1
            elif ever_exited and c > ma20 and qqq_ok and rsi_ok:
                pos = 1; peak = c; entry = c; days = 1
        else:
            if c > peak: peak = c
            days += 1
            if (c - peak) / peak < -STOP or not above_ma200:
                pos = 0; peak = 0; entry = 0; ever_exited = True; days = 0

    return {"pos": pos, "peak": peak, "ever_exited": ever_exited, "days": days}

def get_signal() -> dict:
    tqqq_c = fetch("TQQQ", "1y")
    qqq_c  = fetch("QQQ",  "1y")

    price     = tqqq_c[-1]
    ma200     = calc_ma(tqqq_c, 200)
    ma20      = calc_ma(tqqq_c, FAST_MA)
    rsi14     = calc_rsi(tqqq_c, 14)
    vol_ann   = calc_vol_ann(tqqq_c, 20)
    qqq_price = qqq_c[-1]
    qqq_ma200 = calc_ma(qqq_c, 200)

    above_ma200  = price > ma200
    rsi_ok       = rsi14 < RSI_THRESH
    qqq_above    = qqq_price > qqq_ma200
    target_w     = min(TARGET_VOL / vol_ann, 1.0) * 100 if vol_ann else 0

    sim          = _simulate(tqqq_c, qqq_c)
    trailing_peak = sim["peak"] if sim["pos"] == 1 else max(tqqq_c[-60:])
    dd_from_peak  = (price - trailing_peak) / trailing_peak * 100
    stop_safe     = dd_from_peak > -(STOP * 100)
    reentry_ok    = sim["ever_exited"] and price > ma20 and qqq_above and rsi_ok

    if sim["pos"] == 1:
        signal = "LONG"
        weight = round(target_w, 1)
    else:
        signal = "CASH"
        weight = 0.0

    lines = []
    if signal == "LONG":
        lines.append(f"MA200 위 (${price:.2f} > ${ma200:.2f})")
        lines.append(f"RSI {rsi14:.1f} < {RSI_THRESH}")
        lines.append(f"변동성 {vol_ann*100:.1f}% → 비중 {weight:.0f}%")
        if sim["days"] > 0:
            lines.append(f"진입 후 {sim['days']}일째")
    else:
        if not above_ma200: lines.append(f"MA200 아래 (${price:.2f} < ${ma200:.2f})")
        if not rsi_ok:      lines.append(f"RSI 과매수 ({rsi14:.1f} >= {RSI_THRESH})")
        if not stop_safe:   lines.append(f"트레일링 스탑 이탈 ({dd_from_peak:.1f}%)")
        if not qqq_above:   lines.append("QQQ MA200 아래")
        if reentry_ok:      lines.append("⚡ 재진입 신호 발생!")

    return {
        "name":   "TQQQ v8",
        "signal": signal,
        "weight": weight,
        "price":  price,
        "detail": lines,
        "emoji":  "📈" if signal == "LONG" else "💵",
    }

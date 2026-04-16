"""QLD DCA 전략: v7(30%) + v9(70%) 블렌드"""
from .base import fetch, calc_ma, calc_rsi, calc_bb_lower, calc_dd

BASE_SHARES = 5  # 기준 매수량

def _get_regime_v7(ind: dict) -> str:
    is_bear = ((ind["spy"] < ind["spy_ma200"] and ind["qqq"] < ind["qqq_ma200"])
               or (ind["vix"] > 40 and ind["vix_chg3"] > 0))
    is_bull  = (ind["spy"] > ind["spy_ma200"] and ind["qqq"] > ind["qqq_ma200"]
                and ind["qld"] > ind["qld_ma60"] and ind["qld_ma20"] > ind["qld_ma60"])
    if is_bear: return "BEAR"
    if is_bull: return "BULL"
    return "NEUTRAL"

def _get_regime_v9(ind: dict) -> str:
    is_bear    = ((ind["spy"] < ind["spy_ma200"] and ind["qqq"] < ind["qqq_ma200"])
                  or (ind["vix"] > 40 and ind["vix_chg3"] > 0))
    is_pre_bear = ((ind["spy_dd"] < -0.15
                    or (ind["qld_ma20"] < ind["qld_ma60"] and ind["spy"] < ind["spy_ma50"]))
                   and not is_bear)
    is_caution  = ((ind["spy_dd"] < -0.10 or (ind["vix"] > 20 and ind["vix_chg3"] > 0))
                   and not is_bear and not is_pre_bear)
    is_bull     = (ind["spy"] > ind["spy_ma200"] and ind["qqq"] > ind["qqq_ma200"]
                   and ind["qld"] > ind["qld_ma60"] and ind["qld_ma20"] > ind["qld_ma60"]
                   and not is_bear and not is_pre_bear and not is_caution)
    if is_bear:     return "BEAR"
    if is_pre_bear: return "PRE_BEAR"
    if is_caution:  return "CAUTION"
    if is_bull:     return "BULL"
    return "NEUTRAL"

def _timing_score(ind: dict, regime: str) -> dict:
    ts = 0
    if ind["rsi"] < 35:   ts += 2
    elif ind["rsi"] < 45: ts += 1
    if ind["qld"] < ind["bb_lower"]: ts += 1
    if ind["qld_dd"] < -0.20:   ts += 2
    elif ind["qld_dd"] < -0.10: ts += 1
    if ind["consec_down"] >= 3: ts += 1
    if ind["vix"] > 20 and ind["vix_chg3"] < -2: ts += 1

    skip      = ind["rsi"] > 72 or ind["ret20"] > 0.25
    is_strong = ts >= 3 and not skip and regime in ("BULL", "NEUTRAL")
    is_skip   = skip and regime not in ("BEAR", "PRE_BEAR")
    return {"ts": ts, "is_strong": is_strong, "is_skip": is_skip}

def get_signal() -> dict:
    qld_c = fetch("QLD",  "2y")
    spy_c = fetch("SPY",  "2y")
    qqq_c = fetch("QQQ",  "2y")
    vix_c = fetch("^VIX", "1y")

    qld = qld_c[-1]; spy = spy_c[-1]; qqq = qqq_c[-1]; vix = vix_c[-1]

    # 연속 하락일
    consec_down = 0
    for i in range(len(qld_c)-1, 0, -1):
        if qld_c[i] < qld_c[i-1]: consec_down += 1
        else: break

    ind = {
        "spy":       spy,
        "qqq":       qqq,
        "qld":       qld,
        "vix":       vix,
        "spy_ma200": calc_ma(spy_c, 200),
        "spy_ma50":  calc_ma(spy_c, 50),
        "qqq_ma200": calc_ma(qqq_c, 200),
        "qld_ma60":  calc_ma(qld_c, 60),
        "qld_ma20":  calc_ma(qld_c, 20),
        "vix_chg3":  vix - vix_c[-4] if len(vix_c) >= 4 else 0,
        "rsi":       calc_rsi(qld_c, 14) or 50,
        "bb_lower":  calc_bb_lower(qld_c, 20),
        "spy_dd":    calc_dd(spy_c, 252),
        "qld_dd":    calc_dd(qld_c, 252),
        "ret20":     (qld / qld_c[-21] - 1) if len(qld_c) > 20 else 0,
        "consec_down": consec_down,
    }

    v7_reg = _get_regime_v7(ind)
    v9_reg = _get_regime_v9(ind)
    ts_info = _timing_score(ind, v7_reg)
    is_strong = ts_info["is_strong"]
    is_skip   = ts_info["is_skip"]

    # 주수 계산
    if v7_reg == "BEAR":                     v7 = 0.0
    elif is_strong:                          v7 = BASE_SHARES * 3 * 0.3
    elif not is_skip:                        v7 = BASE_SHARES * 0.3
    else:                                    v7 = 0.0

    if v9_reg in ("BEAR", "PRE_BEAR"):       v9 = 0.0
    elif v9_reg == "CAUTION":                v9 = BASE_SHARES * 0.7 * (0.5 if is_strong else 0.4)
    elif is_strong:                          v9 = BASE_SHARES * 3 * 0.7
    elif not is_skip:                        v9 = BASE_SHARES * 0.7
    else:                                    v9 = 0.0

    total_shares = v7 + v9
    cost = total_shares * qld

    # 신호 요약
    if v7_reg == "BEAR" and v9_reg in ("BEAR", "PRE_BEAR"):
        signal = "BEAR"
    elif is_strong:
        signal = "STRONG"
    elif is_skip:
        signal = "SKIP"
    elif total_shares == 0:
        signal = "CASH"
    else:
        signal = "BUY"

    lines = [
        f"v7 레짐: {v7_reg}  |  v9 레짐: {v9_reg}",
        f"타이밍 점수: {ts_info['ts']}점  |  RSI: {ind['rsi']:.1f}",
        f"v7({v7:.1f}주) + v9({v9:.1f}주) = 총 {total_shares:.1f}주",
        f"예상 매수금액: ${cost:.0f}",
    ]
    if is_skip:   lines.append("⏭ 과열 구간 — 오늘 스킵")
    if is_strong: lines.append("⚡ STRONG 신호 (3배 매수)")

    emoji_map = {"BEAR": "🐻", "STRONG": "⚡", "SKIP": "⏭", "CASH": "💵", "BUY": "🟢"}

    return {
        "name":   "QLD DCA",
        "signal": signal,
        "weight": round(total_shares, 1),  # QLD는 주수 기준
        "price":  qld,
        "detail": lines,
        "emoji":  emoji_map.get(signal, "🟢"),
        "is_dca": True,  # DCA 전략임을 표시
    }

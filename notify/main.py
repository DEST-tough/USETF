"""
ETF 통합 신호 알림 — 매일 한국시간 11:00 (02:00 UTC)
텔레그램으로 통합 메시지 1회 전송
"""
import os
import sys
import requests
from datetime import datetime, timezone, timedelta
from strategies import ALL_STRATEGIES

BOT_TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
CHAT_ID   = os.environ["TELEGRAM_CHAT_ID"]

KST = timezone(timedelta(hours=9))

def send_telegram(text: str):
    url  = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    resp = requests.post(url, json={
        "chat_id": CHAT_ID,
        "text":    text,
    }, timeout=15)
    resp.raise_for_status()

def build_message(results: list[dict], errors: list[str]) -> str:
    now_kst = datetime.now(KST).strftime("%Y-%m-%d %H:%M KST")

    lines = [f"📊 ETF 전략 신호  |  {now_kst}", ""]

    for r in results:
        sig = r["signal"]
        if r.get("is_dca"):
            header = f"{r['emoji']} {r['name']}  →  {sig}  ({r['weight']}주)"
        else:
            weight_str = f" ({r['weight']:.0f}%)" if r["weight"] > 0 else ""
            header = f"{r['emoji']} {r['name']}  →  {sig}{weight_str}"

        lines.append(header)
        for d in r["detail"]:
            lines.append(f"  · {d}")
        lines.append("")

    if errors:
        lines.append("━━━━━━━━━━━━")
        for e in errors:
            lines.append(f"⚠️ {e}")

    warn = [r for r in results if r["signal"] in ("STOP", "BEAR", "CASH")]
    if not warn and not errors:
        lines.append("━━━━━━━━━━━━")
        lines.append("✅ 주의 신호 없음")

    return "\n".join(lines)

def main():
    results = []
    errors  = []

    for fn in ALL_STRATEGIES:
        try:
            r = fn()
            results.append(r)
            print(f"[OK] {r['name']}: {r['signal']}")
        except Exception as e:
            name = fn.__module__.split(".")[-1].upper()
            errors.append(f"{name} 오류: {e}")
            print(f"[ERR] {name}: {e}", file=sys.stderr)

    if not results and errors:
        send_telegram("⚠️ ETF 알림 전체 실패\n" + "\n".join(errors))
        sys.exit(1)

    msg = build_message(results, errors)
    print("\n--- 메시지 미리보기 ---")
    print(msg)
    print("---")
    send_telegram(msg)
    print("텔레그램 전송 완료")

if __name__ == "__main__":
    main()

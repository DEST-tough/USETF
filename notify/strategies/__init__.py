from .tqqq import get_signal as tqqq_signal
from .upro import get_signal as upro_signal
from .qld  import get_signal as qld_signal

# 새 전략 추가 시 여기에 import 추가만 하면 됨
ALL_STRATEGIES = [
    upro_signal,
    tqqq_signal,
    qld_signal,
]

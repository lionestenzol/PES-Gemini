import math
from decimal import Decimal, ROUND_FLOOR

def compute_capacity(total, fixed, meals, recovery, work_unit=0.25):
    if any(v < 0 for v in (total, fixed, meals, recovery)):
        raise ValueError("All capacity values must be non-negative.")
    if fixed > total or meals > total or recovery > total:
        raise ValueError("Fixed, meals, and recovery cannot exceed total hours.")
    if (fixed + meals + recovery) > total:
        raise ValueError("Sum of fixed, meals, and recovery cannot exceed total hours.")
    if not all(math.isfinite(v) for v in (total, fixed, meals, recovery)):
        raise ValueError("All capacity values must be finite numbers.")

    available = total - fixed - meals - recovery
    if work_unit <= 0 or not math.isfinite(work_unit):
        raise ValueError("work_unit must be a positive finite number.")
    raw_limit = Decimal(str(available)) * Decimal("0.70")
    unit = Decimal(str(work_unit))
    limit = float((raw_limit / unit).to_integral_value(rounding=ROUND_FLOOR) * unit)
    return available, limit

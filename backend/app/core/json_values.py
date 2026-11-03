"""Strict JSON values shared by persistence and API reads, including legacy rows."""
import math


def json_safe(value):
    if isinstance(value, float) and not math.isfinite(value):
        name = 'NaN' if math.isnan(value) else ('Infinity' if value > 0 else '-Infinity')
        return f'[non-finite: {name}]'
    if isinstance(value, dict):
        return {key: json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(item) for item in value]
    return value

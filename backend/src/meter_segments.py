"""Pure meter-timeline math for mid-hour steam meter swaps.

A swap replaces the meter between two hourly boundary readings. The hour of the
swap is billed as the sum of each meter's own increment, and every same-meter
segment keeps the voucher (source_ref) of its two boundary points.
"""
from decimal import Decimal


def timeline(readings, swaps):
    """Sorted (moment, order, kg) points; a swap contributes old-final then new-initial."""
    points = [(row.reading_at, 0, row.cumulative_kg) for row in readings]
    for swap in swaps:
        points.append((swap.swapped_at, 1, swap.old_final_kg))
        points.append((swap.swapped_at, 2, swap.new_initial_kg))
    return sorted(points)


def neighbors(readings, swaps, moment):
    """Cumulative kg of the closest timeline points strictly before and after moment."""
    before = after = None
    for point in timeline(readings, swaps):
        if point[0] < moment:
            before = point
        elif point[0] > moment and after is None:
            after = point
    return (before[2] if before is not None else None), (after[2] if after is not None else None)


def hour_segments(readings, swaps, slots):
    """Split each [start, end) slot into same-meter segments.

    Returns one entry per slot: {'start', 'end', 'kg', 'segments'}. kg is None
    when a boundary reading is missing. Each segment carries the cumulative
    values and vouchers of its two boundary points; the swap hour therefore
    lists one segment per meter and kg is the sum of the segment increments.
    """
    reads = {row.reading_at: row for row in readings}
    hours = []
    for start, end in zip(slots, slots[1:]):
        left, right = reads.get(start), reads.get(end)
        if left is None or right is None:
            hours.append({'start': start, 'end': end, 'kg': None, 'segments': []})
            continue
        points = [{'at': start, 'kg': left.cumulative_kg, 'source': left.source_ref, 'jump': False}]
        for swap in swaps:
            if start < swap.swapped_at < end:
                points.append({'at': swap.swapped_at, 'kg': swap.old_final_kg,
                               'source': swap.source_ref, 'jump': True})
                points.append({'at': swap.swapped_at, 'kg': swap.new_initial_kg,
                               'source': swap.source_ref, 'jump': False})
        points.append({'at': end, 'kg': right.cumulative_kg, 'source': right.source_ref, 'jump': False})
        segments = []
        total = Decimal(0)
        for current, following in zip(points, points[1:]):
            if current['jump']:
                continue  # meter switch: the two values belong to different meters
            delta = following['kg'] - current['kg']
            total += delta
            segments.append({'start_at': current['at'], 'end_at': following['at'],
                             'start_kg': current['kg'], 'end_kg': following['kg'], 'kg': delta,
                             'start_source': current['source'], 'end_source': following['source']})
        hours.append({'start': start, 'end': end, 'kg': total, 'segments': segments})
    return hours

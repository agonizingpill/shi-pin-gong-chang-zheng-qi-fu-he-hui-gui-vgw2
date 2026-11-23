from hashlib import sha256
from json import dumps
import warnings

import numpy as np
from sklearn.exceptions import ConvergenceWarning
from sklearn.feature_selection import mutual_info_regression
from sklearn.linear_model import HuberRegressor
from sklearn.preprocessing import StandardScaler

FEATURES = ['杀菌釜运行分钟', 'CIP 清洗分钟', '漂烫机运行分钟', '设备启动次数', '环境温度 °C', '班内小时序号']
SEED = 1064
EPSILON = 1.35
MIN_SPIKE_KG = 60


def fingerprint(snapshot):
    return sha256(dumps(snapshot, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


def train(rows):
    x = np.array([row['features'] for row in rows])
    y = np.array([row['kg'] for row in rows])
    usable = np.flatnonzero(np.ptp(x, axis=0) > 1e-9)
    if len(usable) == 0 or np.ptp(y) < 1e-9:
        raise ValueError('历史工况或耗汽量缺少变化，无法建立负荷基线')
    values = mutual_info_regression(x[:, usable], y, random_state=SEED, n_neighbors=3)
    ranking = sorted(zip(usable.tolist(), values.tolist()), key=lambda item: (-item[1], item[0]))
    selected = [i for i, _score in ranking[:3]]
    transform = StandardScaler().fit(x[:, selected])
    with warnings.catch_warnings():
        warnings.simplefilter('error', ConvergenceWarning)
        regressor = HuberRegressor(epsilon=EPSILON, alpha=0.0001, max_iter=1000).fit(
            transform.transform(x[:, selected]), y)
    return ranking, selected, transform, regressor


def predict(rows, selected, transform, regressor):
    x = np.array([row['features'] for row in rows])
    return np.maximum(0, regressor.predict(transform.transform(x[:, selected])))


def estimate(snapshot):
    history = snapshot['history']
    target = snapshot['target']
    holdout_code = history[-1]['shift']
    train_rows = [row for row in history if row['shift'] != holdout_code]
    holdout = [row for row in history if row['shift'] == holdout_code]
    if len(train_rows) < 12 or len(holdout) < 2:
        raise ValueError('至少需要 12 个历史训练小时和 2 个留出小时')
    _, selected, scaler, model = train(train_rows)
    held_prediction = predict(holdout, selected, scaler, model)
    mae = np.mean(np.abs(held_prediction - np.array([row['kg'] for row in holdout])))

    ranking, selected, scaler, model = train(history)
    residual_threshold = EPSILON * float(model.scale_)
    verification_threshold = max(MIN_SPIKE_KG, residual_threshold)
    historical = predict(history, selected, scaler, model)
    fitted = predict(target, selected, scaler, model)
    spikes = []
    for scope, records, baseline in [('history', history, historical), ('target', target, fitted)]:
        for row, value in zip(records, baseline):
            if row['kg'] - value >= verification_threshold:
                spikes.append({'scope': scope, 'shift': row['shift'], 'start': row['start'],
                               'start_read_id': row['start_read_id'], 'end_read_id': row['end_read_id'],
                               'observed_kg': row['kg'], 'baseline_kg': round(float(value), 2)})
    baseline_total = float(fitted.sum())
    measured = sum(row['kg'] for row in target)
    return {
        'algorithm': 'Mutual Information + HuberRegressor', 'random_seed': SEED,
        'parameters': {'top_k': 3, 'n_neighbors': 3, 'epsilon': EPSILON, 'alpha': 0.0001,
                       'max_iter': 1000, 'spike_floor_kg': MIN_SPIKE_KG},
        'sample': {'training': len(train_rows), 'holdout': len(holdout), 'refit': len(history),
                   'holdout_shift': holdout_code, 'historical_shifts': list(dict.fromkeys(row['shift'] for row in history))},
        'metrics': {'holdout_mae_kg': round(float(mae), 2), 'huber_outliers': int(model.outliers_.sum()),
                    'spike_threshold_kg': round(verification_threshold, 2)},
        'features': [{'name': FEATURES[i], 'score': round(score, 4), 'selected': i in selected}
                     for i, score in ranking],
        'profile': [{'start': row['start'], 'observed_kg': row['kg'], 'baseline_kg': round(float(value), 2),
                     'flagged': bool(row['kg'] - value >= verification_threshold)} for row, value in zip(target, fitted)],
        'baseline_kg': round(baseline_total, 2), 'observed_kg': round(measured, 2),
        'excess_kg': round(measured - baseline_total, 2), 'spikes': spikes,
    }

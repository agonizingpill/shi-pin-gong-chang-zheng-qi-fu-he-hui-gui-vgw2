export const ROLE = {operator: '值班员', supervisor: '能源主管', viewer: '只读访客'};
export const SHIFT = {open: '采集中', sealed: '已封账'};
export const PLAN = {queued: '等待估计', running: '估计中', failed: '估计失败', estimated: '待审批', approved: '已审批'};
export const REVIEW = {pending: '待复核', closed: '已结案'};
export const FINDING = {process_surge: '工艺尖峰属实', instrument_suspect: '仪表疑点，保留原值'};
export const ASSET = {'RET-01': '杀菌釜', 'CIP-02': 'CIP 清洗站', 'BLN-03': '漂烫机'};
export const LINE = {'LINE-A': 'A 线 · 杀菌釜', 'LINE-B': 'B 线 · 调理'};

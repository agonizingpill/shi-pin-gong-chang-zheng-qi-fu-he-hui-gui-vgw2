# 食品工厂蒸汽负荷回归

清禾食品的蒸汽值班簿把产线班次、蒸汽总量表和设备运行记录串成一份可追溯的班后节能复核单。

## 使用场景

清禾食品是虚构的中型预制食品厂，约 120 人，设杀菌和调理两条产线。值班员以前把抄表数据写在交接簿里，设备开停时间留在各站的 PLC 导出或手工记录内，主管再用 Excel 汇总日耗。补抄经常漏掉跨午夜的时点，同一设备被双重记账，日耗总量也无法区分正常工况和一次性尖峰。

排产给班次、批号、产品和环境温度，计量员提供累计读数与凭证编号，生产站提供启停时刻。值班簿校验并封账，后台建立同产线的小时耗汽基线。能源主管把尖峰核验和后续措施交给设备班组及能效班后会。

| 角色 | 主要工位 | 典型动作 |
| --- | --- | --- |
| `operator` 值班员 | 班次采集、负荷估计 | 登记班次、逐小时抄表、录入启停、封账、提交估计 |
| `supervisor` 能源主管 | 班次采集、负荷估计、节能复核 | 值班员权限、带理由更正启停、审批、逐条核验、签署结案、查审计 |
| `viewer` 只读访客 | 三个业务工位 | 查阅台账、结果和复核单，下载估计证据 |

## 启动

```bash
cp .env.example .env
docker compose config --quiet
docker compose up -d --build --wait
docker compose exec -T backend python -m scripts.seed_demo
```

| 入口 | 地址或端口 |
| --- | --- |
| 网页 | `http://localhost:18263` |
| API 文档 | `http://localhost:19263/docs` |
| MySQL | `localhost:17763`，库名和用户名为 `steam` |

| 工号 | 演示口令 |
| --- | --- |
| `operator` | `SteamOps1064!` |
| `supervisor` | `SteamLead1064!` |
| `viewer` | `SteamView1064!` |

`SEED_DEMO=true` 时 API 启动会补齐演示数据。显式运行 seed 适用于重复演示或启动时 seed 日志报错后恢复。自然键按工号和班次编号识别，已有班次、样本和复核保留原状。演示账号由 seed 创建。

## 一次晚班交接

1. 2026 年 11 月 21 日 14:00，值班员周岚接手 `LINE-A`，确认 `A-1121-B` 的在产品为菌菇炖汁，批号 `QH-261121-B`。
2. 周岚参照 `蒸汽交接簿-21日-B班` 逐小时登记 `FM-A01`。14:00 的初值为 471,000 kg，各时点保留来源编号。
3. 将 `RET-01` 杀菌釜、`CIP-02` 清洗站、`BLN-03` 漂烫机的启停录入班次。允许不同设备同时运行，同设备首尾相接允许。
4. 22:00 补齐班末读数并封账。缺少任何小时读数、累计值倒挂、缺启停或同设备重叠都会阻断交接和方案。
5. 值班员为该班提交「晚班供汽基线 · 菌菇炖汁」。演示启动时已准备方案和一份待复核单，可从网页直接检查结果。
6. 主管查阅 14:00 至 21:00 的实耗与估计曲线，查看互信息入模特征及留出误差，审批后生成班后复核单。
7. 复核单提示历史班次 `A-1119-B` 的 18:00–19:00 有一次尖峰。依据 `尖峰原表照片编号 P-19-1900` 和两条累计读数，主管填入核验结论与凭证说明。
8. 主管填写班次偏差判断和下一班措施后结案。查看者可以追踪同一原表和处理意见。

## 负荷估计口径

- 使用最近最多 12 个同线、目标班前已结束且封账的班次。采集窗固定为一小时，蒸汽耗量为窗末累计读数减窗初读数。选取杀菌釜、CIP、漂烫机的窗内运行分钟，设备启动次数，室外温度及班内小时序号作为候选特征。
- 留出最近一班评估 MAE，其他历史班至少要有 12 小时，留出班至少 2 小时。在训练部分估计互信息和标准化参数，筛选最高分的最多三项，再拟合 `HuberRegressor`。评估完成后以全部历史小时重新筛选并拟合，对目标班工况估计小时耗汽基线。
- 固定互信息随机种子 `1064`，近邻数 `3`，Huber `epsilon=1.35`、`alpha=0.0001`、最大迭代 `1000`。恒定特征不参与筛选，缺乏工况和耗汽变化、输入摘要失配或拟合未收敛进入失败状态，可重新提交修订。
- Huber 对大残差采用线性惩罚。历史和目标班中，正向偏差达到 `max(60 kg, epsilon × scale_)` 的小时进入人工核验。复核单保存首末读数的外键、来源、判断、备注、核验者和时间。疑似仪表问题也保留原始值。
- 实耗减基线是同工况的耗汽偏差。结案记录具体处置，供下一班核对。输入快照、SHA-256、参数、样本数、留出指标及估计曲线都随方案留存。

## 工程结构

| 服务 | 实现 | 健康检查 |
| --- | --- | --- |
| frontend | Nginx、原生 HTML/CSS/JS ES modules、Canvas2D | 读取站点首页 |
| backend | Python 3.12、FastAPI、SQLAlchemy、JWT | 请求 `/health` 并访问 MySQL、Redis |
| worker | Python、scikit-learn、Redis 唤醒、MySQL 持久任务与租约 | 检查处理循环心跳 |
| db | MySQL 8.0 | 应用账号执行 `SELECT 1` |
| redis | Redis 7 | `PING` |

`backend/src` 的 `models.py` 声明实体，`schemas.py` 校验输入，`shift_work.py` 和 `planning.py` 承担领域规则，`steam_model.py` 完成拟合。`routes.py` 和 `views.py` 暴露 API，`worker.py` 消费队列，`migrations/initial.py` 初始化当前版本的表。`frontend/src` 按 API、会话状态、复用组件与页面拆分。Nginx 代理 `/api/`，MySQL、Redis 和估计证据各用独立命名卷。任务先提交到 MySQL，再用 Redis 唤醒 worker，丢失唤醒时由 worker 轮询，进程中断可在租约超时后重领。

| 环境变量 | 用途 |
| --- | --- |
| `COMPOSE_PROJECT_NAME` | 本项目容器命名前缀 |
| `FRONTEND_PORT`、`BACKEND_PORT`、`DB_PORT` | 三个宿主机端口 |
| `DB_PASSWORD`、`DB_ROOT_PASSWORD` | 演示用数据库凭证 |
| `JWT_SECRET` | JWT 签名密钥 |
| `SEED_DEMO` | 自动生成演示记录 |
| `DB_HOST`、`DB_NAME`、`DB_USER`、`REDIS_URL`、`ARTIFACT_DIR` | 服务内部连接和证据目录，由 Compose 注入 |

共享枚举定义在 `backend/src/constants.py` 和 `frontend/src/constants.js`。后端对应 `models.py` 的约束、`schemas.py` 的请求校验、`auth.py`／`routes.py` 的访问控制、`shift_work.py`、`planning.py`、`worker.py` 的业务动作，以及 `scripts/seed_demo.py`。前端的角色用于 `components/ui.js` 和各业务页面权限渲染，产线、设备、班次状态用于 `pages/shifts.js`，产线、班次状态和方案状态用于 `pages/plans.js`，复核状态与尖峰判断用于 `pages/reviews.js`。

## 本地开发与清理

保留 Compose 依赖并在宿主机调试 Python 服务。

```bash
cd backend
python3.12 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
# 由项目根目录启动 db、redis，或指定本机相应服务地址。
# Compose 的 Redis 默认无宿主机端口，可在容器中调试 worker。
DB_PORT=17763 python -m migrations.initial
# 设置本机可达的 REDIS_URL 后启动 API 和 worker。
DB_PORT=17763 SEED_DEMO=true uvicorn src.main:app --reload --port 8000
```

前端无构建步骤。改动后执行 `docker compose up -d --build` 重新构建 Nginx 镜像。停止并清理本项目的演示数据可以执行 `docker compose down -v --remove-orphans`。

许可证为 MIT，见 `LICENSE`。

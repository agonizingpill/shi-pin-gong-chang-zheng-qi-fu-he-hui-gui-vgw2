export function loginPage() {
  return `<main class="login-layout"><section class="login-aside">
    <div class="brand"><i class="mark" aria-hidden="true"></i><span>清禾食品 <small>· 公用工程</small></span></div>
    <div><p class="eyebrow">生产能源 / 蒸汽计量</p><h1>蒸汽<br>值班簿<span>。</span></h1>
    <p class="lead">交接班次、追溯抄表来源，<br>按同线工况复核耗汽偏差。</p></div>
    <div class="pipe-plan" aria-label="蒸汽从总管流经计量点并分配到生产设备"><span>蒸汽总管</span><i></i><strong>FM-A01</strong><i></i><span>杀菌釜 / 清洗站</span></div>
    </section><section class="login-panel"><p class="eyebrow">值班交接</p><h2>登录工位</h2>
    <form data-login><label>工号<input name="username" autocomplete="username" placeholder="输入工号" required></label>
      <label>口令<input name="password" type="password" autocomplete="current-password" placeholder="输入口令" required></label>
      <button type="submit">打开值班簿</button><p class="feedback" role="alert" hidden></p></form>
    <div class="demo-row"><span>填入演示工号</span><div><button type="button" class="plain" data-demo="operator">值班员</button>
      <button type="button" class="plain" data-demo="supervisor">能源主管</button>
      <button type="button" class="plain" data-demo="viewer">只读访客</button></div></div>
    </section></main>`;
}

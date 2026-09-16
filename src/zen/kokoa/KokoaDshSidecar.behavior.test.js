// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * KokoaDshSidecar 的行为测试（不需要浏览器 / 不需要真 dsh 进程）。
 *
 * 【★ 最重要的一条：token 不能泄漏】
 *   getDshState() 给【设置页】用 —— 它会显示在 UI 上。
 *   state.url 里【带 dsh 的 token】（形如 .../?token=xxx）。
 *   所以 getDshState 只暴露 hasUrl: boolean，【绝不】暴露 url 本身。
 *   这条用测试钉死（安全相关，回归了就是事故）。
 *
 * 【不测什么】
 *   · 能否真拉起 dsh（要真进程）
 *   · Subprocess 的用法（要真进程）
 *   只测【状态机】与【URL 解析】。
 */

const NL = String.fromCharCode(10);

// logline 会 console.debug —— 先静音，最后恢复
const realDebug = console.debug;
console.debug = () => {};

const {
  getDshState,
  stopDsh,
  startDsh,
  ensureDshUrl,
  RE_DSH_URL_LINE,
  RE_DSH_URL_END,
} = await import("./KokoaDshSidecar.mjs");

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; realDebug("  OK   " + name); }
  else { fail++; realDebug("  FAIL " + name + (extra ? "  -> " + extra : "")); }
}

realDebug("=== 一、token 不能泄漏（安全）===");
realDebug("");

{
  const s = getDshState();
  ok("1.1 初始 running=false", s.running === false);
  ok("1.2 初始 hasUrl=false", s.hasUrl === false);
  ok("1.3 初始 port=0", s.port === 0);
}

{
  const s = getDshState();
  const keys = Object.keys(s).sort();
  ok("1.4 字段只有 running/port/hasUrl/log（没有 url）",
     keys.join(",") === "hasUrl,log,port,running", keys.join(","));
  ok("1.5 没有任何字段的值含 token",
     !Object.values(s).some(v => typeof v === "string" && v.indexOf("token") >= 0));
  ok("1.6 log 是数组", Array.isArray(s.log));
}

realDebug("");
realDebug("=== 二、stopDsh 的行为 ===");
realDebug("");

{
  const before = JSON.stringify(getDshState());
  stopDsh("测试：无进程时停");
  ok("2.1 无进程时 stopDsh 不崩", true);
  ok("2.2 状态没被改坏", before === JSON.stringify(getDshState()));
}

{
  stopDsh();
  stopDsh("有原因");
  ok("2.3 有无 reason 都不崩", true);
}

{
  stopDsh("测试");
  const s = getDshState();
  ok("2.4 stopDsh 后 running=false", s.running === false);
  ok("2.5 stopDsh 后 hasUrl=false", s.hasUrl === false);
  ok("2.6 stopDsh 后 port=0", s.port === 0);
}

realDebug("");
realDebug("=== 三、URL 解析（真实 dsh 输出形态）===");
realDebug("");

function parseUrl(input) {
  const a = RE_DSH_URL_LINE.exec(input);
  if (a) { return a[1]; }
  const b = RE_DSH_URL_END.exec(input);
  return b ? b[1] : null;
}

const cases = [
  ["行首+换行", "dsh web: http://127.0.0.1:3080/?token=abc" + NL, "http://127.0.0.1:3080/?token=abc"],
  ["行中有前缀", "[info] dsh web: http://127.0.0.1:3080/?token=xyz" + NL, "http://127.0.0.1:3080/?token=xyz"],
  ["流末尾没换行", "dsh web: http://127.0.0.1:3080/?token=end", "http://127.0.0.1:3080/?token=end"],
];
cases.forEach((c, i) => {
  const got = parseUrl(c[1]);
  ok("3." + (i + 1) + " " + c[0] + " -> " + c[2], got === c[2], "得到 " + got);
});

{
  const bad = ["随便一行日志" + NL, "dsh web: " + NL, ""];
  const none = bad.every(b => parseUrl(b) === null);
  ok("3.4 非 URL 行不会被误认", none);
}

realDebug("");
realDebug("=== 四、导出接口存在 ===");
realDebug("");
ok("4.1 startDsh 是函数", typeof startDsh === "function");
ok("4.2 stopDsh 是函数", typeof stopDsh === "function");
ok("4.3 getDshState 是函数", typeof getDshState === "function");
ok("4.4 ensureDshUrl 是函数", typeof ensureDshUrl === "function");

realDebug("");
realDebug("=== 结果: " + pass + " 通过 / " + fail + " 失败 ===");
process.exit(fail === 0 ? 0 : 1);
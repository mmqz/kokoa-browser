// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * KokoaDshSidecar 的 URL 解析测试。
 *
 * 【为什么写这个】
 * 2026-09-15：我用【真实 dsh 输出样本】测解析逻辑时，连着发现两个缺陷：
 *
 * 缺陷 1：原正则 /dsh web:\s*(\S+)/ 在 stdout【分块到达】时
 *         会匹配出【半截 URL】：
 *           "dsh web: http://127.0.0.1:18"  ->  "http://127.0.0.1:18"
 *
 * 缺陷 2：第一版的兜底 /\S+\s*$/ 放错了位置（在 while 循环里），
 *         它把缺陷 1 的保护【废掉了】—— 因为对"分块前半段"也匹配
 *         （那段的结尾就是当前缓冲的结尾）。
 *
 * 【★ 第三个缺陷：测试自己】
 * 我第一版测试【复制】了正则，结果模块改了、测试没改 ——
 * 测的根本不是真代码。
 * （我故意改坏模块里的正则，测试居然还通过，才发现。）
 *
 * 修法：模块【导出】正则（RE_DSH_URL_LINE / RE_DSH_URL_END），
 *       测试 import 它们。这样模块改正则，测试自动跟着测新的。
 *
 * 【怎么跑】
 *   node src/zen/kokoa/KokoaDshSidecar.test.js
 * 零依赖 —— 故意如此，因为这几个模块要能在浏览器之外单独验证。
 */

// ★ 导入【模块真实的】正则，而不是复制
import { RE_DSH_URL_LINE, RE_DSH_URL_END } from "./KokoaDshSidecar.mjs";

let pass = 0;
let fail = 0;

/**
 * 模拟模块的读取过程：按块喂入，每块只试 RE_DSH_URL_LINE；
 * 全部喂完后（流结束）再试 RE_DSH_URL_END。
 *
 * 【必须与 KokoaDshSidecar.mjs 的 startDsh() 里的逻辑一致】
 *   · 循环内：只 RE_DSH_URL_LINE（要求行尾）
 *   · 循环外（done 后）：再试 RE_DSH_URL_END
 */
function feed(chunks, { streamEnded = true } = {}) {
  let buf = "";
  for (const c of chunks) {
    buf += c;
    const m = buf.match(RE_DSH_URL_LINE);
    if (m) return m[1];
  }
  // 【兜底只在【流真的结束】时用】—— 这是模块的真实语义：
  //   循环内只试 RE_DSH_URL_LINE；
  //   done（流结束）之后才试 RE_DSH_URL_END。
  if (!streamEnded) {
    return null;
  }
  const mEnd = buf.match(RE_DSH_URL_END);
  return mEnd ? mEnd[1] : null;
}

function check(name, chunks, expect, opts) {
  const got = feed(chunks, opts);
  const ok = got === expect;
  if (ok) { pass++; console.log("  ✅ " + name); }
  else {
    fail++;
    console.log("  ❌ " + name);
    console.log("       期望: " + JSON.stringify(expect));
    console.log("       实际: " + JSON.stringify(got));
  }
}

console.log("=== KokoaDshSidecar URL 解析 ===");
console.log("  （正则来自模块： " + RE_DSH_URL_LINE + " ）");
console.log("");

const REAL = "http://127.0.0.1:18318/?token=bGKA4eWx5Ukw5pheygSZclININa7Qc2EmNGQWIDOSw0";

// ① 真实输出（一次到达，含换行）
check("真实输出（完整一行）", ["dsh web: " + REAL + "\n"], REAL);

// ② 日志在前
check("前面有日志行", ["info: ok\n", "dsh web: http://127.0.0.1:8080/?token=abc\n"],
      "http://127.0.0.1:8080/?token=abc");

// ③ ★ 分块到达 —— 缺陷 1 的核心
check("★ 分块：前半段 + 后半段 = 完整 URL",
      ["dsh web: http://127.0.0.1:18", "318/?token=abc\n"],
      "http://127.0.0.1:18318/?token=abc");
check("★ 分块：跨块无换行，末尾才有",
      ["dsh web: http://127.0.0.1:18318/?tok", "en=abcdef\n"],
      "http://127.0.0.1:18318/?token=abcdef");

// ④ ★ 缺陷 2：兜底不能破坏保护
//    前半段不带换行 + 流就断在那里 -> 循环内不该匹配
//    （流结束后兜底才给"半截"—— 那是流真的结束时的可接受行为）
check("★ 流未结束时不该匹配半截",
      ["dsh web: http://127.0.0.1:18"],          // 只到这一块
      null,
      { streamEnded: false });                   // 流【没】结束 -> 不该用兜底

// ⑤ 行尾空白
check("行尾有空白", ["dsh web: http://127.0.0.1:3000/?token=y   \n"],
      "http://127.0.0.1:3000/?token=y");

// ⑥ 无 token
check("无 token（兜底 URL）", ["dsh web: http://127.0.0.1:18318/\n"],
      "http://127.0.0.1:18318/");

// ⑦ 无关输出
check("无关输出（不该匹配）", ["nothing here\n"], null);

// ⑧ 多个候选（取第一个完整行）
check("两个完整行取第一个",
      ["dsh web: http://127.0.0.1:1111/?token=a\ndsh web: http://127.0.0.1:2222/?token=b\n"],
      "http://127.0.0.1:1111/?token=a");

console.log("");
console.log("=== 结果: " + pass + " 通过 / " + fail + " 失败 ===");
process.exit(fail === 0 ? 0 : 1);
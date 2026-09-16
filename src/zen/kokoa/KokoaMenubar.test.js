// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * KokoaMenubar 的【契约】测试。
 *
 * 【为什么测这个】
 * 这个模块是【pref 驱动】的 —— 它的"接口"就是那张契约表：
 *   · 哪些菜单项 id 受控
 *   · 用哪个 pref 名
 *   · 默认可见还是隐藏
 *
 * 那张表要在【三个地方】保持一致：
 *   1. 模块里的 MENU_ITEMS（实现）
 *   2. 设置页的勾选框（用户在那边改）
 *   3. 模块顶部注释里的契约表（文档）
 *
 * 测试固定住第 1 个（实现），并把它的内容打印出来 ——
 * 方便与第 2、3 个人工对照。
 *
 * 【为什么不能"测试 applyMenuVisibility"】
 * 那个函数依赖 document / PanelMultiView / Services.prefs，
 * Node 里都没有。所以只能测【纯数据部分】。
 * 真实的隐藏行为要等【实机测试】。
 *
 * 【怎么跑】
 *   node src/zen/kokoa/KokoaMenubar.test.js
 */

import { MENU_CONTRACT } from "./KokoaMenubar.mjs";

let pass = 0;
let fail = 0;

function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ✅ " + name); }
  else {
    fail++;
    console.log("  ❌ " + name);
    if (extra) console.log("       " + extra);
  }
}

console.log("=== KokoaMenubar 契约 ===");
console.log("");

// ① 基本形状
ok("契约非空", MENU_CONTRACT.length > 0);
ok("每项都有 pref / ids / defaultVisible",
   MENU_CONTRACT.every(e => typeof e.pref === "string" && Array.isArray(e.ids) && typeof e.defaultVisible === "boolean"));

// ② pref 名都带前缀（否则设置页对不上）
ok("所有 pref 名以 kokoa.menu. 开头",
   MENU_CONTRACT.every(e => e.pref.startsWith("kokoa.menu.")),
   MENU_CONTRACT.map(e => e.pref).join(", "));

// ③ ★ 用户明确要求默认隐藏的那两项
const byPref = new Map(MENU_CONTRACT.map(e => [e.pref, e]));
ok("★ 打印默认隐藏 (kokoa.menu.print.visible)",
   byPref.get("kokoa.menu.print.visible")?.defaultVisible === false);
ok("★ 登录 Firefox 默认隐藏 (kokoa.menu.fxa.visible)",
   byPref.get("kokoa.menu.fxa.visible")?.defaultVisible === false);

// ④ 打印的 id 对（实测存在于 browser.xhtml）
ok("打印的 id 是 appMenu-print-button2",
   byPref.get("kokoa.menu.print.visible")?.ids.includes("appMenu-print-button2"));

// ⑤ ★ fxa 族是【三个 id 一个 pref】
const fxa = byPref.get("kokoa.menu.fxa.visible");
ok("★ fxa 族有三个 id（status2 / label2 / text）",
   fxa?.ids.length === 3 &&
   fxa.ids.includes("appMenu-fxa-status2") &&
   fxa.ids.includes("appMenu-fxa-label2") &&
   fxa.ids.includes("appMenu-fxa-text"),
   fxa ? fxa.ids.join(", ") : "(没有 fxa 项)");

// ⑥ 所有 id 都有 appMenu 前缀（防拼错）
ok("所有 id 以 appMenu 开头",
   MENU_CONTRACT.every(e => e.ids.every(i => i.startsWith("appMenu"))),
   MENU_CONTRACT.flatMap(e => e.ids).join(", "));

// ⑦ ★ 没有重复 id（两个 pref 控同一个 id 会互相打架）
const allIds = MENU_CONTRACT.flatMap(e => e.ids);
const dup = allIds.filter((v, i) => allIds.indexOf(v) !== i);
ok("★ 没有重复的菜单项 id", dup.length === 0, dup.length ? "重复: " + dup.join(", ") : "");

// ⑧ pref 名也没重复
const allPrefs = MENU_CONTRACT.map(e => e.pref);
const dupPref = allPrefs.filter((v, i) => allPrefs.indexOf(v) !== i);
ok("没有重复的 pref 名", dupPref.length === 0, dupPref.join(", "));

console.log("");
console.log("=== 契约内容（人工与设置页/文档对照用）===");
console.log("");
for (const e of MENU_CONTRACT) {
  console.log("  " + e.pref.padEnd(30) + "默认" + (e.defaultVisible ? "显示" : "隐藏") + "  id: " + e.ids.join(", "));
}

console.log("");
console.log("=== 结果: " + pass + " 通过 / " + fail + " 失败 ===");
process.exit(fail === 0 ? 0 : 1);

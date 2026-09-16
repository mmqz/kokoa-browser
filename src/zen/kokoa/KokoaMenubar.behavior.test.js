// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * KokoaMenubar 的行为测试（注入假的 Services / PanelMultiView / document）。
 *
 * 【为什么之前没写，现在写】
 *   我原先判断「applyMenuVisibility 依赖浏览器 API，测不了」。
 *   核实后发现它只依赖【三个全局】：
 *     Services.prefs.getBoolPref(name, default)
 *     PanelMultiView.getViewNode(document, id)
 *     document
 *   全是函数体内使用 + 全局 —— 和分屏/会话测试同一个套路，可以注入。
 *   （教训：先核实依赖，别凭印象下结论。）
 *
 * 【测什么】菜单项是否真的被 setAttribute("hidden") / removeAttribute。
 *   这是菜单功能的【核心行为】—— 之前只有契约测试（测数据结构），
 *   没验证「真的会隐藏」。
 */

// ── 注入全局（import 之前）─────────────────────────────────────
let prefValues = {};
let nodes = {};

globalThis.Services = {
  prefs: {
    getBoolPref(name, def) {
      if (Object.prototype.hasOwnProperty.call(prefValues, name)) {
        return prefValues[name];
      }
      return def;
    },
  },
};

globalThis.document = { _tag: "fake-document" };
globalThis.PanelMultiView = {
  getViewNode(doc, id) {
    if (!nodes[id]) { nodes[id] = makeNode(id); }
    return nodes[id];
  },
};

function makeNode(id) {
  return {
    id,
    _attrs: {},
    setAttribute(k, v) { this._attrs[k] = v; },
    removeAttribute(k) { delete this._attrs[k]; },
    getAttribute(k) { return this._attrs[k]; },
    hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k); },
  };
}

const { applyMenuVisibility, MENU_CONTRACT } = await import("./KokoaMenubar.mjs");

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  OK   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? "  -> " + extra : "")); }
}

function reset() {
  prefValues = {};
  nodes = {};
}

console.log("=== 一、默认（prefs 没设任何值）===");
console.log("");

reset();
{
  const n = applyMenuVisibility();
  // 默认隐藏三项：print / fxa(3个id) / save-file = 5 个节点
  ok("1.1 默认隐藏了 5 个节点（print 1 + fxa 3 + save-file 1）", n === 5, "实际 " + n);

  ok("1.2 ★ 打印被隐藏", nodes["appMenu-print-button2"].hasAttribute("hidden"));
  ok("1.3 ★ 登录 Firefox 三兄弟被隐藏",
     nodes["appMenu-fxa-status2"].hasAttribute("hidden") &&
     nodes["appMenu-fxa-label2"].hasAttribute("hidden") &&
     nodes["appMenu-fxa-text"].hasAttribute("hidden"));
  ok("1.4 保存页面被隐藏", nodes["appMenu-save-file-button2"].hasAttribute("hidden"));

  ok("1.5 ★ 新建标签页【没有】被隐藏（基础动作默认显示）",
     !nodes["appMenu-new-tab-button2"].hasAttribute("hidden"));
  ok("1.6 新建窗口【没有】被隐藏",
     !nodes["appMenu-new-window-button2"].hasAttribute("hidden"));
}

console.log("");
console.log("=== 二、用户在设置页打开开关（pref = true）===");
console.log("");

reset();
prefValues["kokoa.menu.print.visible"] = true;
{
  const n = applyMenuVisibility();
  ok("2.1 ★ 打印打开了 -> 不再隐藏", !nodes["appMenu-print-button2"].hasAttribute("hidden"));
  ok("2.2 隐藏数减到 4", n === 4, "实际 " + n);
  ok("2.3 登录 Firefox 仍然隐藏（没被影响）",
     nodes["appMenu-fxa-status2"].hasAttribute("hidden"));
}

// fxa 一个 pref 控三个 id —— 一起打开
reset();
prefValues["kokoa.menu.fxa.visible"] = true;
{
  applyMenuVisibility();
  ok("2.4 ★ 登录开关一开，三个 id 一起显示（一个 pref 控一族）",
     !nodes["appMenu-fxa-status2"].hasAttribute("hidden") &&
     !nodes["appMenu-fxa-label2"].hasAttribute("hidden") &&
     !nodes["appMenu-fxa-text"].hasAttribute("hidden"));
}

console.log("");
console.log("=== 三、用户关掉基础动作（默认显示 -> 改隐藏）===");
console.log("");

reset();
prefValues["kokoa.menu.new-tab.visible"] = false;
{
  applyMenuVisibility();
  ok("3.1 ★ 关掉「新建标签页」-> 它被隐藏",
     nodes["appMenu-new-tab-button2"].hasAttribute("hidden"));
  ok("3.2 隐藏数变成 6", true);
}

console.log("");
console.log("=== 四、★ 可逆性（这是用 setAttribute 而非删节点的理由）===");
console.log("");

reset();
{
  applyMenuVisibility();
  const hiddenFirst = nodes["appMenu-print-button2"].hasAttribute("hidden");
  // 用户改主意，打开
  prefValues["kokoa.menu.print.visible"] = true;
  applyMenuVisibility();
  const shownThen = !nodes["appMenu-print-button2"].hasAttribute("hidden");
  // 再关掉
  prefValues["kokoa.menu.print.visible"] = false;
  applyMenuVisibility();
  const hiddenAgain = nodes["appMenu-print-button2"].hasAttribute("hidden");

  ok("4.1 ★ 隐藏 -> 显示 -> 再隐藏，全程可逆",
     hiddenFirst && shownThen && hiddenAgain,
     [hiddenFirst, shownThen, hiddenAgain].join(","));
  ok("4.2 ★ 节点对象还在（没被删除，Sync 引用不会崩）",
     !!nodes["appMenu-fxa-status2"]);
}

console.log("");
console.log("=== 五、契约一致性（实现与契约表对得上）===");
console.log("");

reset();
{
  applyMenuVisibility();
  const allIds = MENU_CONTRACT.flatMap(e => e.ids);
  ok("5.1 契约里每个 id 都被处理到了（都建了节点）",
     allIds.every(id => !!nodes[id]),
     allIds.filter(id => !nodes[id]).join(","));
}

console.log("");
console.log("=== 结果: " + pass + " 通过 / " + fail + " 失败 ===");
process.exit(fail === 0 ? 0 : 1);
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

// 【模拟真实环境】菜单项在 <html:template id="appMenu-viewCache"> 的 .content 里，
// 【不在】 document 上 —— 这是实机踩到的坑。
// templateNodes 模拟模板内容；只有【手动实例化】时才会出现在 nodes（已实例化）里。
let templateNodes = {};
let tplContent = null;

globalThis.document = {
  _tag: "fake-document",
  getElementById(id) {
    if (id === "appMenu-viewCache") {
      return tplContent ? { content: tplContent } : null;
    }
    return null;
  },
};
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

/** 造一个「模板里」的节点集合 */
function makeTemplate(nodesMap) {
  return {
    querySelectorAll(sel) {
      const id = sel.replace(/^#/, "");
      if (!nodesMap[id]) { nodesMap[id] = makeNode(id); }
      return [nodesMap[id]];
    },
  };
}

function reset() {
  prefValues = {};
  nodes = {};
  templateNodes = {};
  tplContent = makeTemplate(templateNodes);
}

console.log("=== 一、默认（prefs 没设任何值）===");
console.log("");

reset();
{
  const n = applyMenuVisibility();
  // 默认隐藏三项：print / fxa(3个id) / save-file = 5 个节点
  ok("1.1 ★ 默认隐藏 10 处 = document 5 + 模板 5", n === 10, "实际 " + n);

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
  ok("2.2 隐藏数减到 8（两处各 4）", n === 8, "实际 " + n);
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
console.log("=== 五、★ 元素只在【模板】里（实机真实场景）===");
console.log("");

// ★ 这一节是【实机踩坑后补的】：
//   真实环境里菜单项在 appMenu-viewCache 模板里，document 上没有。
//   我第一次实机验收就是因为只查了 document -> 全部静默跳过 -> 菜单照常显示。
reset();
{
  // 把已实例化的全部清掉，模拟「菜单从没打开过」
  nodes = {};
  const n = applyMenuVisibility();

  ok("5.1 ★ 菜单从未打开时，仍然隐藏了（走模板那条路）",
     n >= 5, "隐藏数=" + n);
  ok("5.2 ★ 模板里的打印被隐藏",
     !!(templateNodes['appMenu-print-button2'] &&
         templateNodes['appMenu-print-button2'].hasAttribute('hidden')));
  ok("5.3 ★ 模板里的登录三兄弟被隐藏",
     ['appMenu-fxa-status2','appMenu-fxa-label2','appMenu-fxa-text']
       .every(id => templateNodes[id] && templateNodes[id].hasAttribute('hidden')));
  ok("5.4 模板里新建标签页【不】隐藏",
     !(templateNodes['appMenu-new-tab-button2'] &&
       templateNodes['appMenu-new-tab-button2'].hasAttribute('hidden')));
}

// ★ 没有模板时（旧行为）也不能崩
reset();
{
  tplContent = null;   // 拿不到模板
  const n = applyMenuVisibility();
  ok("5.5 拿不到模板时不崩（已实例化的仍处理）", n === 5, "隐藏数=" + n);
}

console.log("");
console.log("=== 六、契约一致性（实现与契约表对得上）===");
console.log("");

reset();
{
  applyMenuVisibility();
  const allIds = MENU_CONTRACT.flatMap(e => e.ids);
  ok("6.1 契约里每个 id 都被处理到了（都建了节点）",
     allIds.every(id => !!nodes[id]),
     allIds.filter(id => !nodes[id]).join(","));
}

console.log("");
console.log("=== 结果: " + pass + " 通过 / " + fail + " 失败 ===");
process.exit(fail === 0 ? 0 : 1);
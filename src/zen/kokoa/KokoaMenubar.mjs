// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * Kokoa —— 主菜单（appMenu）的可配置项。
 *
 * ═══════════════════════════════════════════════════════════════════════
 * 【要做什么】
 *
 * 让部分主菜单项可以按 pref 隐藏，且【默认隐藏几个 Kokoa 用不到的】。
 * 用户可以在 Kokoa 设置页逐个打开。
 *
 * ═══════════════════════════════════════════════════════════════════════
 * 【机制】（照 Zen 自己的范例，不另创）
 *
 * Zen 已有「用 pref 控制菜单」的现成做法 —— ZenMenubar.mjs L135：
 *
 *     #hideWindowRestoreMenus() {
 *       if (!Services.prefs.getBoolPref("zen.window-sync.enabled", true)) {
 *         return;
 *       }
 *       const itemsToHide = [
 *         "appMenuRecentlyClosedWindows",
 *         "historyUndoWindowMenu",
 *       ];
 *       for (const id of itemsToHide) {
 *         const element = PanelMultiView.getViewNode(document, id);
 *         element.setAttribute("hidden", "true");
 *       }
 *     }
 *
 * 我们照这个做，只是：
 *   · pref 名用 kokoa.menu.<项>.visible（见下表）
 *   · 用【显式的隐藏表】而不是 Zen 那样写死两个 id
 *
 * ═══════════════════════════════════════════════════════════════════════
 * 【★ 为什么用「显式隐藏表」而不是「遍历全部 71 个 appMenu id」】
 *
 * 实测：browser.xhtml 里有 71 个 appMenu 开头的 id。
 * 但我们【只想动少数几个】——
 * 其余保持 Zen/Firefox 的默认行为（默认显示）。
 *
 * 如果遍历全部 71 个，就会把【将来上游新增的项】也强行隐藏 ——
 * 那是「对抗结构」（ADR-017 反对的）。
 * 显式表只覆盖我们【明确知道该隐藏】的项。
 *
 * ═══════════════════════════════════════════════════════════════════════
 * 【默认值表 —— 这是给后续集成者看的契约】
 *
 * | 菜单项 id                        | pref 名                            | 默认 | 理由 |
 * |---|---|---|---|
 * | appMenu-print-button2            | kokoa.menu.print.visible           | false | 用户要求默认隐藏 |
 * | appMenu-fxa-status2              | kokoa.menu.fxa.visible             | false | 用户要求默认隐藏（登录 Firefox） |
 * | appMenu-fxa-label2               | kokoa.menu.fxa.visible             | false | 同族，一起控 |
 * | appMenu-fxa-text                 | kokoa.menu.fxa.visible             | false | 同族 |
 * | appMenu-save-file-button2        | kokoa.menu.save-file.visible       | false | 与打印同族 |
 *
 * 【不需要动的】（保持默认可见）
 *   appMenu-new-tab-button2 / appMenu-new-window-button2 /
 *   appMenu-new-private-window-button2 / appMenu-zoom-controls /
 *   appMenu-quit-button2 ...
 *
 * ═══════════════════════════════════════════════════════════════════════
 * 【两个需要特别注意的项】（工作项 3.3 已标注）
 *
 * 1. appMenu-fxa-* 是【一族】（status2 / label2 / text），
 *    它们由 browser-sync.js 动态操作。
 *    我们只【加 hidden 属性】，不删除节点 —— 这样 Sync 的逻辑不会崩。
 *    （实测：appMenu-fxa-status2 出现在 browser-sync.js 里。）
 *
 * 2. appMenu-new-ai-window-button 是 【Zen 自己的】AI 窗口入口，
 *    不是我们的。默认【保持显示】——
 *    因为我们的 AI 工作区是另一个东西（KokoaAiPanel），
 *    不该擅自藏掉 Zen 的功能。
 */

const LOG_PREFIX = "[Kokoa/menu]";

/** pref 前缀 */
const PREF_PREFIX = "kokoa.menu.";

/**
 * 【隐藏表】—— 这是契约（与上面的文档表一致）。
 *
 * 每项：{ ids: [菜单项 id...], pref: pref 后缀, def: 默认是否可见 }
 */
const MENU_ITEMS = [
  // ── 基础动作（默认显示）─────────────────────────────────
  // 【为什么也列进来】用户要求的是“可配置”，不只是“关掉几个”。
  // 默认显示不等于不能关。设置页里可以逐个改。
  {
    ids: ["appMenu-new-tab-button2"],
    pref: "new-tab.visible",
    def: true,
  },
  {
    ids: ["appMenu-new-window-button2"],
    pref: "new-window.visible",
    def: true,
  },

  // ── 默认隐藏的三项 ─────────────────────────────────
  {
    ids: ["appMenu-print-button2"],
    pref: "print.visible",
    def: false,
  },
  {
    // 【注意】这一族有三个 id，但【只有一个 pref】——
    // 用户看到的是"登录 Firefox"一个开关。
    ids: ["appMenu-fxa-status2", "appMenu-fxa-label2", "appMenu-fxa-text"],
    pref: "fxa.visible",
    def: false,
  },
  {
    ids: ["appMenu-save-file-button2"],
    pref: "save-file.visible",
    def: false,
  },
];

function log(s) {
  console.debug(LOG_PREFIX + " " + s);
}

/**
 * 读某个项的可见性（pref 没设时用默认值）。
 *
 * @param {{pref: string, def: boolean}} item
 * @returns {boolean}
 */
function isVisible(item) {
  try {
    return Services.prefs.getBoolPref(PREF_PREFIX + item.pref, item.def);
  } catch (e) {
    // pref 类型不对等异常 -> 用默认值，不让菜单整个坏掉
    console.warn(LOG_PREFIX + " 读 pref 失败（用默认值）: " + e);
    return item.def;
  }
}

/**
 * 按 pref 应用隐藏/显示。
 *
 * 【为什么是「设 hidden 属性」而不是「删节点」】
 *   删节点不可逆（用户改 pref 后没法恢复），
 *   而且 appMenu-fxa-* 被 browser-sync.js 引用，删了会让它崩。
 *   设属性是可逆的，也符合 Zen 自己的做法。
 *
 * @returns {number} 实际隐藏了几项
 */
export function applyMenuVisibility() {
  let hiddenCount = 0;
  for (const item of MENU_ITEMS) {
    const visible = isVisible(item);
    for (const id of item.ids) {
      let element = null;
      try {
        element = PanelMultiView.getViewNode(document, id);
      } catch (e) {
        // 某些 id 可能不在当前构建里（上游改过名）——
        // 不致命，跳过并记一笔。
        log("取不到菜单项（跳过）: " + id);
        continue;
      }
      if (!element) {
        continue;
      }
      if (visible) {
        element.removeAttribute("hidden");
      } else {
        element.setAttribute("hidden", "true");
        hiddenCount++;
      }
    }
  }
  log("已应用菜单可见性（隐藏 " + hiddenCount + " 项）");
  return hiddenCount;
}

/**
 * 【给测试 / 调试用】导出契约表。
 * 这样测试能验证"表里的 id 与 pref 名"符合预期，
 * 而不用去猜（或复制一份）。
 */
export const MENU_CONTRACT = MENU_ITEMS.map(i => ({
  pref: PREF_PREFIX + i.pref,
  ids: i.ids.slice(),
  defaultVisible: i.def,
}));

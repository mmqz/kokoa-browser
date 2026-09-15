// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * Kokoa AI 工作区 —— 与网页并排（分屏）。
 *
 * ═══════════════════════════════════════════════════════════════════════
 * 【设计原则：用 Zen 的机制，不用对抗式手法】
 *
 * 主线旧外壳（boot.js L1075 toggleAiSplit）自己算坐标、force() 强制定位 ——
 * 那是【注入式】外壳的无奈之举（它没有原生分屏 API）。
 *
 * 我们不同：Zen 有【原生分屏】，而且 AI 面板本来就是一个普通 tab，
 * 所以直接调 gZenViewSplitter.splitTabs 就行。
 * 这也是 ADR-017「拥有结构 vs 对抗结构」的直接应用。
 *
 * ═══════════════════════════════════════════════════════════════════════
 * 【API 事实】（2026-09-15 读 src/zen/split-view/ZenViewSplitter.mjs）
 *
 *   L87    MAX_TABS = 4
 *   L1430  splitTabs(tabs, gridType, initialIndex = 0, { groupFetchId } = {})
 *   L1440  if (tabs.length < 2 || tabs.length > this.MAX_TABS) { return; }
 *          ★ 参数不合法时【静默返回，不报错】—— 所以必须自己断言
 *   L1236  get splitViewActive() { return this.currentView >= 0; }
 *   L1480  tab.splitView = true     ← 标签的分屏标记
 *
 * gridType 取值（从调用点看）：
 *   "vsep"  左右并排（vertical separator）
 *   其它值参见 ZenViewSplitter 的 gridTypes
 *
 * window.gZenViewSplitter 是 nsZenViewSplitter 的实例（L2638 挂上去的）。
 */

/** Zen 的分屏上限（与 ZenViewSplitter.MAX_TABS 一致） */
const MAX_TABS = 4;

function getSplitter() {
  // window.gZenViewSplitter 在 ZenViewSplitter.mjs L2638 挂到 window 上
  return window.gZenViewSplitter || null;
}

/**
 * 当前是否处于分屏状态。
 *
 * @returns {boolean}
 */
export function isSplitActive() {
  const s = getSplitter();
  return !!(s && s.splitViewActive);
}

/**
 * AI 面板当前是否在分屏里。
 *
 * @param {Window} win
 * @param {object|null} aiTab findAiTab 的结果
 * @returns {boolean}
 */
export function isAiInSplit(win, aiTab) {
  if (!aiTab) {
    return false;
  }
  // tab.splitView 是 Zen 给分屏标签打的标记（ZenViewSplitter L1480）
  return !!aiTab.splitView;
}

/**
 * 把 AI 面板与当前网页放进同一个原生分屏。
 *
 * 【与主线的差别】不自己算坐标、不 force 定位 —— 交给 Zen 的原生分屏。
 *
 * @param {Window} win
 * @param {object} aiTab AI 面板标签（openAiTab 的返回）
 * @returns {{ ok: boolean, reason?: string }}
 */
export function splitAiWithCurrent(win, aiTab) {
  const splitter = getSplitter();
  if (!splitter) {
    return { ok: false, reason: "Zen 分屏不可用（gZenViewSplitter 未加载）" };
  }
  if (!aiTab) {
    return { ok: false, reason: "没有 AI 面板标签" };
  }

  const gb = win.gBrowser;
  const target = gb.selectedTab;
  if (!target) {
    return { ok: false, reason: "没有选中的标签" };
  }
  if (target === aiTab) {
    // 选中的就是 AI 标签本身 —— 那没有「并排」的对象
    return { ok: false, reason: "当前选中的就是 AI 面板，没有可并排的网页" };
  }

  // 参数校验（因为 splitTabs 会静默 return，不校验的话失败得莫名其妙）
  const tabs = [target, aiTab];
  if (tabs.length < 2 || tabs.length > MAX_TABS) {
    return { ok: false, reason: "标签数不合法（" + tabs.length + "）" };
  }

  try {
    // vsep = 左右并排；initialIndex=1 让 AI 在右侧
    splitter.splitTabs(tabs, "vsep", 1);
  } catch (e) {
    return { ok: false, reason: "splitTabs 抛错: " + e };
  }

  // 【必须自己断言】—— splitTabs 参数不合法时静默 return，
  // 光看「没抛错」不能认为成功。
  const active = isSplitActive();
  if (!active) {
    return { ok: false, reason: "splitTabs 调用了但分屏没激活（可能被拒）" };
  }
  return { ok: true };
}

/**
 * 把 AI 面板从分屏里拆出来。
 *
 * @param {Window} win
 * @param {object} aiTab
 * @returns {{ ok: boolean, reason?: string }}
 */
export function unsplitAi(win, aiTab) {
  const splitter = getSplitter();
  if (!splitter || !aiTab) {
    return { ok: false, reason: "没有分屏或没有 AI 标签" };
  }
  try {
    // 【2026-09-15 修】我最初写的 splitter.unsplitTabs 是【错的】——
    //   ZenViewSplitter 里没有这个方法。
    //   真实的 API 是 unsplitCurrentView()（ZenViewSplitter.mjs L2016）：
    //     unsplitCurrentView() {
    //       if (this.currentView < 0) { return; }
    //       this.removeGroup(this.currentView);
    //       ...
    //     }
    //   它按【当前视图】拆，不是按单个标签。
    //   这意味着：调用前要先确保 AI 面板所在的那个分屏是当前视图。
    //   下面的做法：先选中 AI 标签（它属于那个分屏），再拆。
    win.gBrowser.selectedTab = aiTab;
    splitter.unsplitCurrentView();
  } catch (e) {
    return { ok: false, reason: "unsplit 抛错: " + e };
  }
  // 断言：拆完后 AI 标签不应再带 splitView 标记
  if (aiTab.splitView) {
    return { ok: false, reason: "调用了 unsplitCurrentView 但标签仍在分屏里" };
  }
  return { ok: true };
}

/**
 * 开/关：AI 面板与当前网页并排。
 *
 * 这是给调用方的入口：
 *   toggleAiSplit(window, aiTab);
 *
 * @param {Window} win
 * @param {object} aiTab
 * @returns {{ ok: boolean, action?: string, reason?: string }}
 */
export function toggleAiSplit(win, aiTab) {
  if (!aiTab) {
    return { ok: false, reason: "没有 AI 面板标签" };
  }
  if (isAiInSplit(win, aiTab)) {
    const r = unsplitAi(win, aiTab);
    return r.ok ? { ok: true, action: "unsplit" } : r;
  }
  const r = splitAiWithCurrent(win, aiTab);
  return r.ok ? { ok: true, action: "split" } : r;
}
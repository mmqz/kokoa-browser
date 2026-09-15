// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * Kokoa 设置分类的逻辑。
 *
 * 【怎么被注册】
 *   preferences-js.patch 里加：
 *     register_module("paneKokoa", gKokoaSettings);
 *   它会调本对象的 init()。
 *
 * 【陷阱】paneKokoa 不会命中 template 展开条件（见 kokoaSettings.inc.xhtml 注释），
 *         所以同一个 patch 里还要改那个条件。
 */

const { openAiTab } = ChromeUtils.importESModule(
  "resource:///modules/zen/KokoaAiPanel.mjs"
);

var gKokoaSettings = {
  /**
   * 由 preferences.js 的 register_module 调用。
   */
  init() {
    this._initAiButtons();
    this._refreshDshStatus();
  },

  _initAiButtons() {
    const openBtn = document.getElementById("kokoaOpenAiWorkspace");
    const splitBtn = document.getElementById("kokoaToggleAiSplit");

    if (openBtn) {
      openBtn.addEventListener("command", () => {
        // 用与工具栏按钮相同的路径 —— 复用模块，不重复实现
        const r = openAiTab(window);
        console.info(
          "[Kokoa] 设置页：AI 工作区 " + (r.reused ? "复用" : "打开")
        );
        this._refreshDshStatus();
      });
    }

    if (splitBtn) {
      splitBtn.addEventListener("command", async () => {
        try {
          const { ensureDshUrl } = ChromeUtils.importESModule(
            "resource:///modules/zen/KokoaDshSidecar.mjs"
          );
          const { toggleAiSplit } = ChromeUtils.importESModule(
            "resource:///modules/zen/KokoaAiSplit.mjs"
          );
          await ensureDshUrl();
          const tab = openAiTab(window).tab;
          const r = toggleAiSplit(window, tab);
          console.info("[Kokoa] 设置页：AI 分屏 -> " + (r.ok ? r.action : r.reason));
        } catch (e) {
          console.error("[Kokoa] 设置页分屏失败: " + e);
        }
      });
    }
  },

  /**
   * 展示 dsh sidecar 的运行状态。
   *
   * 【为什么显示这个】用户遇到「AI 面板打不开」时，
   * 第一件事就是想知道 dsh 到底在不在跑、要连哪里。
   * 这里直接把状态摆在设置里，省得去翻控制台。
   */
  _refreshDshStatus() {
    const el = document.getElementById("kokoaDshStatus");
    if (!el) {
      return;
    }
    try {
      const { getDshState } = ChromeUtils.importESModule(
        "resource:///modules/zen/KokoaDshSidecar.mjs"
      );
      const s = getDshState();
      // 【不要在这里显示 token】—— getDshState 只给 hasUrl 布尔
      const text = s.running
        ? "dsh 正在运行（端口 " + s.port + (s.hasUrl ? "，已拿到 token" : "，等待 token") + "）"
        : "dsh 未运行 —— 点上面的按钮会尝试拉起它";
      el.textContent = text;
      el.setAttribute("data-l10n-id", "");
      el.removeAttribute("data-l10n-id");
    } catch (e) {
      el.textContent = "dsh 状态不可用：" + e;
    }
  },
};

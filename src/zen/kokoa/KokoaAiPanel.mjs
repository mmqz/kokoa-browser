// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * Kokoa AI 工作区 —— 面板 URL 与标签管理。
 *
 * 【这个模块的来历】
 * 逻辑移植自主线旧外壳的 apps/gecko-shell/.../kokoa/boot.js（3036 行）：
 *   · panelUrl()    L154-L170   三级回退拿带 token 的 URL
 *   · urlBase()     L1282-L1284 去掉 ? 与 # 再比较
 *   · findAiTab()   L1047-L1063 找已有的 AI 标签
 *   · openAiTab()   L1066-L1072 打开 AI 标签
 *
 * 主线是【注入式】外壳，这些函数是内联在 boot.js 里的；
 * 我们是【源码级】，所以抽成独立模块，便于复用与测试。
 *
 * 【以后要加的】（见 docs/workitem-ai-porting.md）
 *   · startSidecar / stopSidecar —— 自己拉起 dsh（主线 boot.js L504/L627）
 *   · probeBridge                —— 探测 dsh 是否就绪（L380）
 *   那些依赖「dsh 从哪来」的产品决策，暂缓。
 */

const DEFAULT_DSH_URL = "http://127.0.0.1:3080/";

/**
 * 拿 AI 工作区的 URL。
 *
 * 三级回退（照抄主线 boot.js L154-L170 的 panelUrl）：
 *   1. 环境变量 KOKOA_DSH_URL —— 启动器注入，【带 token】
 *   2. <KOKOA_STATE_DIR>/gecko-shell/kokoa-panel.url —— 开发期文件
 *   3. 硬编码兜底 —— 会缺 token
 *
 * @returns {{ url: string, source: string }}
 */
export function getPanelUrl() {
  // 1) 环境变量优先 —— 它带着 dsh 的 token
  try {
    const injected = Services.env.get("KOKOA_DSH_URL") || "";
    if (injected) {
      return { url: injected, source: "env:KOKOA_DSH_URL" };
    }
  } catch (e) {
    // Services.env 在某些沙箱下不可用 —— 不是致命错误，继续回退
  }

  // 2) 开发期文件：<state>/gecko-shell/kokoa-panel.url
  //    注意：调用方可能是【同步】的命令处理函数，
  //    所以这里用同步的 FileUtils，不用 await IOUtils.readUTF8。
  try {
    const stateDir = Services.env.get("KOKOA_STATE_DIR") || "";
    if (stateDir) {
      const { FileUtils } = ChromeUtils.importESModule(
        "resource://gre/modules/FileUtils.sys.mjs"
      );
      // ProfD 只是拿一个 File 对象当模板，随后用 stateDir 覆盖绝对路径
      const file = FileUtils.getFile("ProfD", []);
      file.initWithPath(stateDir);
      file.append("gecko-shell");
      file.append("kokoa-panel.url");
      if (file.exists()) {
        // 用 nsIFileInputStream + 显式 UTF-8 解码。
        // （FileUtils.readFileToString 已废弃；IOUtils.readUTF8 是 async，本函数不是。）
        const stream = Cc[
          "@mozilla.org/network/file-input-stream;1"
        ].createInstance(Ci.nsIFileInputStream);
        stream.init(file, -1, -1, 0);
        const raw = NetUtil.readInputStreamToString(stream, stream.available(), {
          charset: "UTF-8",
        });
        stream.close();
        if (raw && raw.trim()) {
          return { url: raw.trim(), source: "file:kokoa-panel.url" };
        }
      }
    }
  } catch (e) {
    // 文件不存在是正常情况，继续回退
  }

  // 3) 兜底 —— 会缺 token，调用方应给出可操作的提示
  return { url: DEFAULT_DSH_URL, source: "hardcoded(no token)" };
}

/**
 * 去掉 query 与 fragment。
 *
 * 【为什么必须同时切掉 ? 与 #】——主线 boot.js L1039-L1041 的实测教训：
 *   AI 标签的 URL 形如 <base>/?token=xxx#kokoa-ws=<id>
 *   漏切任一都会让 findAiTab 认不出它 —— 分屏 / 复用会【全部失配】。
 *
 * @param {string} spec
 * @returns {string}
 */
export function urlBase(spec) {
  return String(spec || "")
    .split("?")[0]
    .split("#")[0];
}

/**
 * 找【已经打开的】AI 工作区标签。
 *
 * @param {Window} win
 * @returns {object|null} 标签对象；没有则 null
 */
export function findAiTab(win) {
  const gb = win?.gBrowser;
  if (!gb) {
    return null;
  }
  const base = urlBase(getPanelUrl().url);
  for (const tab of gb.tabs) {
    try {
      const browser = tab.linkedBrowser;
      const spec = browser?.currentURI?.spec;
      if (spec && urlBase(spec) === base) {
        return tab;
      }
    } catch (e) {
      // 标签尚未初始化 —— 跳过
    }
  }
  return null;
}

/**
 * 打开 AI 工作区标签（若已有则复用）。
 *
 * 【与原实现的差别】原实现每次都 addTab，会开出一堆重复标签；
 * 这里先 findAiTab 复用。这是移植主线 L1047/L1066 的直接收益。
 *
 * @param {Window} win
 * @param {string} [wsFrag] 可选的工作区 fragment，形如 "#kokoa-ws=<id>"
 * @returns {{ tab: object, reused: boolean, url: string, source: string }}
 */
export function openAiTab(win, wsFrag) {
  const { url: base, source } = getPanelUrl();

  // 先找已有的（不看 fragment —— 同一个 dsh 面板只应有一个标签）
  const existing = findAiTab(win);
  if (existing) {
    try {
      win.gBrowser.selectedTab = existing;
    } catch (e) {
      // 选中失败不致命
    }
    return { tab: existing, reused: true, url: base, source };
  }

  const url = base + (wsFrag || "");
  const tab = win.gBrowser.addTab(url, {
    inBackground: false,
    triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    // 不让 space-routing 按 URL 规则把它挪到别的 space。
    // 依据：ZenSpaceRoutingManager.sys.mjs L216 的 options.skipRoute
    skipRoute: true,
  });
  win.gBrowser.selectedTab = tab;
  return { tab, reused: false, url, source };
}

/**
 * 这个 URL 是否带 dsh 的 token。
 * 不带时调用方应给出提示（否则 dsh 会显示 "web authentication required"）。
 *
 * @param {string} url
 * @returns {boolean}
 */
export function hasToken(url) {
  return /[?&]token=/.test(String(url || ""));
}

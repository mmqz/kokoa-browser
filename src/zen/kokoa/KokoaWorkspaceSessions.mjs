// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * Kokoa —— 工作区与 dsh 会话的联动。
 *
 * ═══════════════════════════════════════════════════════════════════════
 * 【要做什么】
 *
 * 切到某个工作区时，把它的 dsh 会话 id 推给 AI 面板；
 * 在某个工作区里新建会话时，把 id 记回工作区。
 *
 * ═══════════════════════════════════════════════════════════════════════
 * 【挂在哪个钩子】（都已读源码核实）
 *
 * gZenWorkspaces.addChangeListeners(func, opts)   ZenSpaceManager.mjs L1680
 *   回调签名： await func({ workspace, onInit })  同文件 L2459
 *   官方自己也这么用： src/zen/spaces/ZenSpaceCreation.mjs
 *     gZenWorkspaces.addChangeListeners(this.handleZenWorkspacesChangeBind, { once: true });
 *
 * 【为什么用这个钩子而不是改 changeWorkspace】
 *   TASK-02 的结论：它是最干净的挂点（官方 API，不改核心逻辑）。
 *   【已知局限】（TASK-02 自己标注为「我认为」）：
 *     回调在切换【完成之后】触发 —— 所以无法在切换前拦截 / 阻塞。
 *     目前我们不需要拦截，所以够用。
 *
 * ═══════════════════════════════════════════════════════════════════════
 * 【存储在哪】
 *
 * 工作区对象上的 kokoaSessionId 字段（见 ZenSpaceManager.mjs）：
 *   · 读写： gZenWorkspaces.getSpaceSessionId(uuid) / updateSpaceSessionId(uuid, id)
 *   · 持久化：会话存储自动带上（TASK-05 无白名单）
 *   · 同步：不会被带走（TASK-08 字段白名单）
 */

const LOG_PREFIX = "[Kokoa/session]";

/** 已注册的监听器（保留引用，便于移除） */
let listener = null;

function log(s) {
  console.debug(LOG_PREFIX + " " + s);
}

/**
 * 拿到当前活动工作区。
 *
 * @returns {object|null}
 */
function activeWorkspace() {
  try {
    return gZenWorkspaces?.activeWorkspace || null;
  } catch (e) {
    return null;
  }
}

/**
 * 切到某个工作区时被调用。
 *
 * 【这一步做什么】把工作区绑定的会话 id 通知给 AI 面板。
 * 【为什么是「通知」而不是「直接切」】
 *   因为 dsh 的会话切换能力我们还没查清（见 workitem-ai-panel-interface.md
 *   里「❓ 从 dsh 标签切到某个会话到底能不能做到」那一条）。
 *   所以这里先【把状态暴露出来】，等接口确定了再接。
 *
 * @param {{workspace: object, onInit: boolean}} ev
 */
async function onWorkspaceChanged({ workspace, onInit }) {
  if (!workspace) {
    return;
  }
  const sessionId = workspace.kokoaSessionId || null;
  log(
    "切换到工作区 " + (workspace.name || workspace.uuid) +
      "（会话 " + (sessionId || "未绑定") + "）" +
      (onInit ? " [首次初始化]" : "")
  );

  // 把状态挂到 window 上，供 AI 面板 / 设置页 / 调试读取。
  // 【为什么不直接操作面板】—— 见上面「为什么是通知而不是直接切」。
  try {
    window.kokoaActiveSpaceSession = {
      spaceUuid: workspace.uuid,
      spaceName: workspace.name || "",
      sessionId,
      at: Date.now(),
    };
  } catch (e) {
    // 忽略
  }

  if (onInit) {
    // 启动时不做事 —— 避免在初始化阶段触碰面板（那时它还不在）
    return;
  }

  // 【待接】如果将来查清 dsh 怎么切会话，这里就是接线的地方。
  // 目前只记录状态，不改面板。
}

/**
 * 注册监听器。应当在使用方初始化时调用一次。
 *
 * @returns {boolean} 是否注册成功
 */
export function initWorkspaceSessionBinding() {
  try {
    if (!window.gZenWorkspaces) {
      console.warn(LOG_PREFIX + " gZenWorkspaces 不可用，无法注册");
      return false;
    }
    if (listener) {
      // 已注册 —— 不重复
      return true;
    }
    listener = onWorkspaceChanged;
    gZenWorkspaces.addChangeListeners(listener);
    log("已注册工作区切换监听");
    return true;
  } catch (e) {
    console.error(LOG_PREFIX + " 注册失败: " + e);
    return false;
  }
}

/**
 * 反注册（给测试 / 关闭用）。
 */
export function uninitWorkspaceSessionBinding() {
  try {
    if (listener && window.gZenWorkspaces) {
      gZenWorkspaces.removeChangeListeners(listener);
      listener = null;
      log("已移除监听");
    }
  } catch (e) {
    // 忽略
  }
}

/**
 * 【给 AI 面板用】把某个会话 id 记到当前工作区。
 *
 * 调用时机：用户在这个工作区里新开了一个 dsh 会话。
 *
 * @param {string|null} sessionId
 * @returns {boolean}
 */
export function bindSessionToActiveSpace(sessionId) {
  try {
    const ws = activeWorkspace();
    if (!ws) {
      console.warn(LOG_PREFIX + " 没有活动工作区，无法绑定");
      return false;
    }
    const ok = gZenWorkspaces.updateSpaceSessionId(ws.uuid, sessionId);
    log(
      (ok ? "已绑定" : "绑定失败") +
        "：工作区 " + (ws.name || ws.uuid) + " -> 会话 " + (sessionId || "null")
    );
    return ok;
  } catch (e) {
    console.error(LOG_PREFIX + " 绑定失败: " + e);
    return false;
  }
}

/**
 * 【给 AI 面板用】读当前工作区绑定的会话 id。
 *
 * @returns {string|null}
 */
export function getActiveSpaceSessionId() {
  try {
    const ws = activeWorkspace();
    return ws ? ws.kokoaSessionId || null : null;
  } catch (e) {
    return null;
  }
}

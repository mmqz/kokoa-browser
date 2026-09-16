// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * KokoaWorkspaceSessions 的行为测试（假 gZenWorkspaces，不需要浏览器）。
 *
 * 【模块做什么】把 dsh 的会话 id 绑到 Zen 的工作区（space）上：
 *   绑定 -> updateSpaceSessionId(uuid, id)（写进 workspace.kokoaSessionId）
 *   读取 -> activeWorkspace().kokoaSessionId
 *   切换 -> 把 { spaceUuid, sessionId } 挂到 window.kokoaActiveSpaceSession
 *
 * 【★ Node 里要显式建 gZenWorkspaces 全局】
 *   源码【混用】两种写法：
 *     检查用 window.gZenWorkspaces（L110/L133）
 *     使用用裸标识符 gZenWorkspaces（L53/L119/L134/L158）
 *   浏览器里裸标识符会解析成 window 的属性，所以能跑；
 *   但 Node 没有隐式全局，所以这里显式建一个同名的，指向同一个对象。
 *
 * 【为什么现在只测「状态暴露」】
 *   源码 L99 写了：dsh 的会话切换能力还没查清，
 *   所以这个模块【故意只记录状态，不改面板】。
 *   测试固定住这个【当前契约】，等接口查清再补。
 */

globalThis.window = { gZenWorkspaces: null };
globalThis.gZenWorkspaces = null;

const {
  initWorkspaceSessionBinding,
  uninitWorkspaceSessionBinding,
  bindSessionToActiveSpace,
  getActiveSpaceSessionId,
} = await import("./KokoaWorkspaceSessions.mjs");

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ✅ " + name); }
  else { fail++; console.log("  ❌ " + name + (extra ? "  -> " + extra : "")); }
}

/**
 * 造一个假的 gZenWorkspaces。
 * 【对齐真实实现】ZenSpaceManager L1275 的 updateSpaceSessionId
 * 是【直接写 workspace.kokoaSessionId 再 saveWorkspace】，
 * 而 getActiveSpaceSessionId 读的正是 ws.kokoaSessionId ——
 * 所以 fake 必须也写回对象，否则「写了读不到」是 fake 的错，不是代码的错。
 */
function fakeWorkspaces(o) {
  o = o || {};
  const gw = {
    activeWorkspace: o.activeWorkspace || null,
    _listeners: [],
    _calls: [],
    addChangeListeners(fn) { gw._listeners.push(fn); gw._calls.push("add"); },
    removeChangeListeners(fn) {
      gw._listeners = gw._listeners.filter(f => f !== fn);
      gw._calls.push("remove");
    },
    getSpaceSessionId(uuid) {
      const ws = (o.all || []).find(w => w.uuid === uuid);
      return ws ? ws.kokoaSessionId || null : null;
    },
    updateSpaceSessionId(uuid, id) {
      gw._calls.push("update:" + uuid + ":" + id);
      if (o.updateOk === false) { return false; }
      const pool = [gw.activeWorkspace].concat(o.all || []);
      const ws = pool.find(w => w && w.uuid === uuid);
      if (!ws) { return false; }
      ws.kokoaSessionId = id || null;
      return true;
    },
  };
  return gw;
}

function setGW(gw) {
  globalThis.window.gZenWorkspaces = gw;
  globalThis.gZenWorkspaces = gw;
  return gw;
}

console.log("=== 一、注册与注销 ===");
console.log("");

{
  setGW(null);
  ok("① 没有 gZenWorkspaces 时返回 false（不抛异常）",
     initWorkspaceSessionBinding() === false);
}
{
  const gw = setGW(fakeWorkspaces());
  ok("② ★ 注册成功返回 true", initWorkspaceSessionBinding() === true);
  ok("② 调用了 addChangeListeners", gw._calls.includes("add"));
  ok("② 注册了 1 个监听器", gw._listeners.length === 1);
}
{
  const gw = setGW(fakeWorkspaces());
  initWorkspaceSessionBinding();
  uninitWorkspaceSessionBinding();
  ok("③ ★ 注销后监听器被移除", gw._listeners.length === 0);
  ok("③ 调用了 removeChangeListeners", gw._calls.includes("remove"));
}
{
  setGW(fakeWorkspaces());
  uninitWorkspaceSessionBinding();
  ok("④ 未注册就注销不崩", true);
}

console.log("");
console.log("=== 二、绑定会话到当前工作区 ===");
console.log("");

{
  setGW(fakeWorkspaces({ activeWorkspace: null }));
  ok("⑤ 没有活动工作区时返回 false", bindSessionToActiveSpace("s1") === false);
}
{
  const ws = { uuid: "u1", name: "工作" };
  const gw = setGW(fakeWorkspaces({ activeWorkspace: ws }));
  ok("⑥ ★ 有工作区时返回 true", bindSessionToActiveSpace("sess-42") === true);
  ok("⑥ 调用了 updateSpaceSessionId(uuid, id)",
     gw._calls.some(c => c === "update:u1:sess-42"));
  ok("⑥ ★ 写进了 workspace.kokoaSessionId（读得到）",
     ws.kokoaSessionId === "sess-42", String(ws.kokoaSessionId));
}
{
  const gw = setGW(fakeWorkspaces({ activeWorkspace: { uuid: "u1" }, updateOk: false }));
  ok("⑦ ★ 底层更新失败时返回 false（不假装成功）",
     bindSessionToActiveSpace("s1") === false);
}

console.log("");
console.log("=== 三、读取当前工作区的会话 ===");
console.log("");

{
  setGW(fakeWorkspaces({ activeWorkspace: null }));
  ok("⑧ 无工作区时返回 null（不抛）", getActiveSpaceSessionId() === null);
}
{
  setGW(fakeWorkspaces({ activeWorkspace: { uuid: "u1", kokoaSessionId: "sess-99" } }));
  ok("⑨ ★ 返回绑定的会话 id", getActiveSpaceSessionId() === "sess-99",
     String(getActiveSpaceSessionId()));
}
{
  setGW(fakeWorkspaces({ activeWorkspace: { uuid: "u2" } }));
  ok("⑩ 未绑定时返回 null", getActiveSpaceSessionId() === null);
}
// ⑩-2 【端到端】先绑再读 —— 这两个函数是配对的
{
  const ws = { uuid: "u3", name: "端到端" };
  setGW(fakeWorkspaces({ activeWorkspace: ws }));
  bindSessionToActiveSpace("sess-e2e");
  ok("⑩-2 ★ 绑定后能读回同一个 id（写读一致）",
     getActiveSpaceSessionId() === "sess-e2e", String(getActiveSpaceSessionId()));
}

console.log("");
console.log("=== 四、切换工作区时把状态挂到 window ===");
console.log("");

{
  const gw = setGW(fakeWorkspaces({ activeWorkspace: { uuid: "u1", name: "主" } }));
  delete globalThis.window.kokoaActiveSpaceSession;
  initWorkspaceSessionBinding();
  const listener = gw._listeners[0];
  await listener({ workspace: { uuid: "u1", name: "主", kokoaSessionId: "sess-7" }, onInit: false });
  const st = globalThis.window.kokoaActiveSpaceSession;
  ok("⑪ ★ 切换后状态挂到了 window.kokoaActiveSpaceSession", !!st, JSON.stringify(st));
  ok("⑪ 记下了 spaceUuid", st && st.spaceUuid === "u1");
  ok("⑪ 记下了 sessionId", st && st.sessionId === "sess-7");
  ok("⑪ 记下了 spaceName", st && st.spaceName === "主");
  ok("⑪ 带时间戳", st && typeof st.at === "number" && st.at > 0);
}
{
  const gw = setGW(fakeWorkspaces({ activeWorkspace: { uuid: "u1" } }));
  uninitWorkspaceSessionBinding();
  initWorkspaceSessionBinding();
  await gw._listeners[0]({ workspace: { uuid: "u9", name: "新" }, onInit: false });
  const st = globalThis.window.kokoaActiveSpaceSession;
  ok("⑫ ★ 未绑定时 sessionId 是 null（明确表示「没绑」）",
     st && st.sessionId === null, JSON.stringify(st));
}
{
  const gw = setGW(fakeWorkspaces({ activeWorkspace: { uuid: "u1" } }));
  delete globalThis.window.kokoaActiveSpaceSession;
  uninitWorkspaceSessionBinding();
  initWorkspaceSessionBinding();
  await gw._listeners[0]({ workspace: { uuid: "u1", kokoaSessionId: "s1" }, onInit: true });
  ok("⑬ 首次初始化时【也】记录状态（但不做后续动作）",
     !!globalThis.window.kokoaActiveSpaceSession);
}
{
  const gw = setGW(fakeWorkspaces({ activeWorkspace: { uuid: "u1" } }));
  delete globalThis.window.kokoaActiveSpaceSession;
  uninitWorkspaceSessionBinding();
  initWorkspaceSessionBinding();
  await gw._listeners[0]({ workspace: null, onInit: false });
  ok("⑭ workspace 为 null 时不崩且不写状态",
     globalThis.window.kokoaActiveSpaceSession === undefined);
}

console.log("");
console.log("=== 结果: " + pass + " 通过 / " + fail + " 失败 ===");
process.exit(fail === 0 ? 0 : 1);

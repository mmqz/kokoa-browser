// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * findNode / findDsh 的行为测试（注入假的 Subprocess / IOUtils / Services）。
 *
 * 【为什么测这个】
 *   这两个函数里有【Windows PATHEXT 坑】的处理（文档里专门标过）：
 *     Subprocess.pathSearch 在 Windows 上没 PATHEXT 时只做精确名匹配，
 *     所以不能只搜 "node"，要试 node.exe / node.cmd / node / nodejs 多个候选。
 *   还有【候选顺序】和【兜底路径】—— 都是容易回归的地方。
 *
 * 【为什么之前没测】
 *   我以为它依赖真进程。核实后:依赖的是 Subprocess.pathSearch、
 *   IOUtils.exists、Services.dirsvc —— 【全是全局 + 函数体内】，可以注入。
 *   （这跟我在 KokoaMenubar 上犯的判断错误是同一类。）
 *
 * 【不测什么】真正 spawn 进程（Subprocess.call）—— 那个要真进程。
 */

// ── 注入全局 ───────────────────────────────────────────────────
let pathSearchResults = {};   // name -> path | null
let existingPaths = new Set();// IOUtils.exists 返回 true 的路径
let searchCalls = [];         // 记录被搜过的名字（验证候选顺序）
let homeDir = "C:/Users/test";

globalThis.Subprocess = {
  pathSearch(name) {
    searchCalls.push(name);
    const r = pathSearchResults[name];
    return r === undefined ? null : r;
  },
};

globalThis.IOUtils = {
  exists(p) { return existingPaths.has(p); },
};

globalThis.Services = {
  dirsvc: {
    get(kind) { return { path: homeDir }; },
  },
};
globalThis.Ci = { nsIFile: "nsIFile" };

const { findNode, findDsh } = await import("./KokoaDshSidecar.mjs");

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  OK   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? "  -> " + extra : "")); }
}

function reset() {
  pathSearchResults = {};
  existingPaths = new Set();
  searchCalls = [];
  homeDir = "C:/Users/test";
  console.debug = () => {};
}

console.log("=== 一、findNode:候选顺序（Windows PATHEXT 坑）===");
console.log("");

reset();
{
  // 只让 node.exe 命中 -> 应该第一个就返回
  pathSearchResults["node.exe"] = "C:/Program Files/nodejs/node.exe";
  const r = await findNode();
  ok("1.1 node.exe 命中 -> 返回它", r === "C:/Program Files/nodejs/node.exe", String(r));
  ok("1.2 第一个搜的就是 node.exe", searchCalls[0] === "node.exe", searchCalls.join(","));
}

reset();
{
  // node.exe 没命中，node.cmd 命中 -> 要继续试第二个
  pathSearchResults["node.cmd"] = "C:/Program Files/nodejs/node.cmd";
  const r = await findNode();
  ok("1.3 ★ 第一个失败会继续试下一个（不 early-return）",
     r === "C:/Program Files/nodejs/node.cmd", String(r));
  ok("1.4 试过 node.exe 再试 node.cmd",
     searchCalls[0] === "node.exe" && searchCalls[1] === "node.cmd", searchCalls.join(","));
}

reset();
{
  // 全都没命中 -> 试完 4 个候选
  await findNode();
  ok("1.5 ★ 四个候选都试过（node.exe/cmd/node/nodejs）",
     searchCalls.length === 4, searchCalls.join(","));
}

console.log("");
console.log("=== 二、findNode:pathSearch 全失败时走兜底路径 ===");
console.log("");

reset();
{
  existingPaths.add("C:/Program Files/nodejs/node.exe");
  const r = await findNode();
  ok("2.1 ★ 兜底找到 Windows 常见安装位置",
     r === "C:/Program Files/nodejs/node.exe", String(r));
}

reset();
{
  existingPaths.add("/usr/local/bin/node");
  const r = await findNode();
  ok("2.2 兜底找到 Linux/macOS 位置", r === "/usr/local/bin/node", String(r));
}

reset();
{
  const r = await findNode();
  ok("2.3 ★ 都找不到 -> 返回 null（不抛异常）", r === null, String(r));
}

console.log("");
console.log("=== 三、findNode:异常处理 ===");
console.log("");

reset();
{
  // pathSearch 抛异常 -> 应继续下一个候选，不整体失败
  globalThis.Subprocess.pathSearch = () => { throw new Error("boom"); };
  existingPaths.add("C:/Program Files/nodejs/node.exe");
  const r = await findNode();
  ok("3.1 ★ pathSearch 抛异常不崩（继续走兜底）",
     r === "C:/Program Files/nodejs/node.exe", String(r));
  // 恢复
  globalThis.Subprocess.pathSearch = (name) => {
    searchCalls.push(name);
    const x = pathSearchResults[name];
    return x === undefined ? null : x;
  };
}

console.log("");
console.log("=== 四、findDsh:依赖 findNode，且拼 npm 全局路径 ===");
console.log("");

reset();
{
  const r = await findDsh();
  ok("4.1 ★ 找不到 node 时 findDsh 返回 null（不空指针）", r === null, JSON.stringify(r));
}

reset();
{
  pathSearchResults["node.exe"] = "C:/PF/nodejs/node.exe";
  existingPaths.add(homeDir + "/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/lib/bin.js");
  const r = await findDsh();
  ok("4.2 ★ 找到 Windows 的 dsh 入口", !!r && r.node === "C:/PF/nodejs/node.exe", JSON.stringify(r));
  ok("4.3 bin 指向 @deepseek-ai/dsh/lib/bin.js",
     !!r && r.bin.indexOf("@deepseek-ai/dsh/lib/bin.js") >= 0, r && r.bin);
}

reset();
{
  pathSearchResults["node"] = "/usr/bin/node";
  existingPaths.add("/usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js");
  const r = await findDsh();
  ok("4.4 ★ 找到 Linux/macOS 的 dsh 入口", !!r, JSON.stringify(r));
}

reset();
{
  pathSearchResults["node"] = "/usr/bin/node";
  const r = await findDsh();
  ok("4.5 ★ node 有但 dsh 没装 -> 返回 null（给出明确信号）", r === null, JSON.stringify(r));
}

console.log("");
console.log("=== 结果: " + pass + " 通过 / " + fail + " 失败 ===");
process.exit(fail === 0 ? 0 : 1);
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * Kokoa AI 工作区 —— dsh sidecar 的拉起与 URL 获取。
 *
 * ═══════════════════════════════════════════════════════════════════════
 * 【这个模块解决什么问题】
 *
 * 之前点 AI 按钮，我们只是【打开一个 URL】——
 * 但如果 dsh 没在跑，打开的就是个连不上的页面。
 * 现象就是用户看到的：
 *   "dsh web authentication required; reopen the URL printed by dsh web."
 *
 * 所以正确做法是：按钮 → 若 dsh 没起则【自己拉起它】→ 拿到带 token 的 URL
 * → 再打开。这个模块就干这个。
 *
 * ═══════════════════════════════════════════════════════════════════════
 * 【关键事实：dsh web 怎么给我们 URL】（2026-09-15 实测）
 *
 * 命令：  dsh web --no-open --port <port>
 *   （dsh web 是 dsh --profile web 的别名；--no-open 让它别自己弹浏览器）
 *
 * 它把带 token 的 URL 【打印到 stdout】，格式：
 *   dsh web: http://127.0.0.1:18318/?token=bGKA4eWx5Ukw5pheygSZclININa7Qc2EmNGQWIDOSw0
 *
 * 所以我们要：spawn 它 → 读 stdout → 匹配 "^dsh web: (\S+)" → 拿到 URL。
 *
 * ═══════════════════════════════════════════════════════════════════════
 * 【移植来源与继承的坑】
 *
 * 逻辑参照主线旧外壳 boot.js（3036 行）的：
 *   findNode()      L435   找 node/可执行文件（含 Windows PATHEXT 坑）
 *   drainStdout()   L479   持续读子进程输出（防阻塞）
 *   startSidecar()  L504   拉起 + 复用 + 错误分类
 *   stopSidecar()   L627   收尾
 *
 * 【三条硬约束】（主线读 Subprocess.sys.mjs 源码所得，我们照继承）
 *   1. options.command 必须是【全路径】—— 源码原文：
 *      "Relative paths are not accepted, and \`$PATH\` is not searched."
 *   2. 传 options.environment 不带 environmentAppend:true 时，
 *      environment 会【整体替换】继承环境（node 会失去 PATH）
 *      -> 我们用 environmentAppend:true
 *   3. 子进程 stdout 【恒为管道】，不持续读会在缓冲区满后【阻塞】
 *      -> 必须一直读（本模块边读边解析）
 *
 * 【Windows PATHEXT 坑】（主线 L444-L448 源码 + 实测）
 *   pathSearch 的 Windows 实现：
 *     if (environment.PATHEXT) exts = environment.PATHEXT.split(";");
 *   即【没有 PATHEXT 时 exts 为空】，只做精确名匹配 —— "node" 匹配不到 node.exe
 *   -> 逐个候选名试，不依赖 PATHEXT 是否存在
 */

const DEFAULT_PORT = 18318;

/** 已拉起的 sidecar 状态 */
const state = {
  proc: null,
  url: "",        // 带 token 的 URL
  port: 0,
  starting: null, // 进行中的启动 Promise（防并发重复拉起）
  log: [],
};

function logline(s) {
  state.log.push(s);
  if (state.log.length > 200) {
    state.log.shift();
  }
  console.debug("[Kokoa/dsh] " + s);
}

/**
 * 找 node 可执行文件。
 *
 * 【为什么不能直接用 "node"】
 * Subprocess 不搜 $PATH（见文件头约束 1）；
 * 且 Windows 上没有 PATHEXT 时 pathSearch 只做精确名匹配（见文件头）。
 *
 * @returns {Promise<string|null>} 全路径，或 null
 */
export async function findNode() {
  // ① 先试 pathSearch + 候选名（不同平台后缀不同）
  const candidates = ["node.exe", "node.cmd", "node", "nodejs"];
  for (const name of candidates) {
    try {
      const p = await Subprocess.pathSearch(name);
      if (p) {
        return p;
      }
    } catch (e) {
      // 找不到这个候选名 —— 继续下一个
    }
  }

  // ② 再试常见安装位置（pathSearch 都失败时兜底）
  const guesses = [
    "C:/Program Files/nodejs/node.exe",
    "C:/Program Files (x86)/nodejs/node.exe",
    "/usr/bin/node",
    "/usr/local/bin/node",
  ];
  for (const guess of guesses) {
    try {
      // IOUtils.exists 是 async —— 本函数是 async，可以用
      if (await IOUtils.exists(guess)) {
        return guess;
      }
    } catch (e) {
      // 忽略
    }
  }
  return null;
}

/**
 * 找 dsh 的 CLI 入口。
 *
 * 【为什么不用 "dsh"】同上：Subprocess 不搜 $PATH。
 * dsh 是 npm 全局包，入口是 <npm-global>/node_modules/@deepseek-ai/dsh/lib/bin.js
 *
 * @returns {Promise<{node: string, bin: string}|null>}
 */
export async function findDsh() {
  const node = await findNode();
  if (!node) {
    logline("找不到 node");
    return null;
  }

  // npm 全局目录的常见位置
  const home = Services.dirsvc.get("Home", Ci.nsIFile).path;
  const guesses = [
    // Windows
    home + "/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/lib/bin.js",
    // macOS / Linux
    "/usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js",
    "/usr/lib/node_modules/@deepseek-ai/dsh/lib/bin.js",
    home + "/.npm-global/lib/node_modules/@deepseek-ai/dsh/lib/bin.js",
  ];
  for (const guess of guesses) {
    try {
      if (await IOUtils.exists(guess)) {
        return { node, bin: guess };
      }
    } catch (e) {
      // 忽略
    }
  }
  logline("找不到 dsh（试过 " + guesses.length + " 个常见位置）");
  return null;
}

/**
 * 探测已经有一个 dsh 在跑吗（复用而不重复拉起）。
 *
 * @param {string} url 带 token 的 URL
 * @returns {Promise<boolean>}
 */
async function probeExisting(url) {
  if (!url) {
    return false;
  }
  try {
    const resp = await fetch(url, { method: "HEAD" });
    return !!resp;
  } catch (e) {
    return false;
  }
}

/**
 * 拉起 dsh 并等它打印出带 token 的 URL。
 *
 * @returns {Promise<{url: string}|{error: string}>}
 */
export function startDsh() {
  // 已在启动中 —— 复用同一个 Promise（防并发重复拉起）
  if (state.starting) {
    return state.starting;
  }
  state.starting = (async () => {
    if (state.url) {
      return { url: state.url };
    }

    const found = await findDsh();
    if (!found) {
      return {
        error:
          "找不到 dsh 或 node。请确认已安装 Node.js 与 dsh" +
          "（npm i -g @deepseek-ai/dsh），且它们在标准位置。",
      };
    }

    const port = DEFAULT_PORT;
    logline("spawn: " + found.node + " " + found.bin + " web --no-open --port " + port);

    // 【约束 1】command 必须全路径 —— 已满足（findNode/findDsh 都返回全路径）
    // 【约束 2】environmentAppend:true —— 否则 node 失去 PATH
    // 【约束 3】必须持续读 stdout —— 下面边读边等
    const proc = await Subprocess.call({
      command: found.node,
      arguments: [found.bin, "web", "--no-open", "--port", String(port)],
      environmentAppend: true,
      environment: {
        // 让 dsh 知道我们在管它（与主线的约定一致，便于调试）
        KOKOA_BRIDGE_PORT: String(port),
        KOKOA_PARENT_PIPE: "1",
      },
      stderr: "pipe",
    });
    state.proc = proc;
    state.port = port;

    // 读 stdout，等 "dsh web: <url>" 那一行
    let buf = "";   // 【注意】在 Promise 【外】声明 —— 超时后要用它记日志
    const url = await new Promise(resolve => {
      const timer = setTimeout(() => resolve(""), 30000); // 30s 超时
      (async () => {
        try {
          const reader = proc.stdout.getReader();
          while (true) {
            const { value, done } = await reader.read();
            if (done) {
              break;
            }
            buf += new TextDecoder().decode(value);
            // 输出格式：dsh web: http://127.0.0.1:PORT/?token=XXX
            const m = buf.match(/dsh web:\s*(\S+)/);
            if (m) {
              clearTimeout(timer);
              resolve(m[1]);
              return;
            }
          }
        } catch (e) {
          logline("读 stdout 出错: " + e);
        }
        clearTimeout(timer);
        resolve("");
      })();
    });

    if (!url) {
      logline("30 秒内没等到 URL；已输出内容: " + buf.slice(-300));
      return { error: "dsh 起来了，但没打印出带 token 的 URL（超时）。" };
    }

    // 解析端口（dsh 可能自己换端口）
    const pm = url.match(/:([0-9]+)\//);
    if (pm) {
      state.port = parseInt(pm[1], 10);
    }
    state.url = url;
    logline("ready: " + url.replace(/token=[^&]*/, "token=***"));
    return { url };
  })();

  // 无论成败，都清掉 starting（下次调用重新评估）
  const p = state.starting;
  p.finally(() => {
    state.starting = null;
  });
  return p;
}

/**
 * 确保有一个可用的 dsh，并返回带 token 的 URL。
 *
 * 这是给调用方的【唯一入口】：
 *   const { url, error } = await ensureDshUrl();
 *
 * @returns {Promise<{url?: string, error?: string, reused?: boolean}>}
 */
export async function ensureDshUrl() {
  // 已经在跑 -> 直接复用
  if (state.url && (await probeExisting(state.url))) {
    return { url: state.url, reused: true };
  }
  state.url = "";
  const r = await startDsh();
  if (r.error) {
    return { error: r.error };
  }
  return { url: r.url };
}

/**
 * 停掉 sidecar。
 *
 * @param {string} [reason] 记日志用
 */
export function stopDsh(reason) {
  if (!state.proc) {
    return;
  }
  logline("停止 sidecar (" + (reason || "未说明") + ")");
  try {
    state.proc.kill();
  } catch (e) {
    // 已退出
  }
  state.proc = null;
  state.url = "";
  state.port = 0;
}

/** 当前状态（给设置页 / 调试用） */
export function getDshState() {
  return {
    running: !!state.proc,
    port: state.port,
    // 不暴露 token
    hasUrl: !!state.url,
    log: state.log.slice(-30),
  };
}
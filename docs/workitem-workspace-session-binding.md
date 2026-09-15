# 工作项：space ↔ dsh 会话绑定（实施计划）

> 依据：ADR-019 + TASK-02（挂点）+ TASK-05（持久化）+ TASK-03（分屏）
> **本文只写「怎么做」，全部建立在已验证的事实上。未验证的明确标注。**

---

# 一、目标（产品语言）

```
切到某个工作区  ->  它对应的那次 AI 对话【自动回来】
在一个工作区新建对话  ->  它【记住】属于哪个工作区
关掉工作区  ->  它的会话【被收尾】
```

# 二、已具备的技术依据（**都有行号，已核验**）

| 事实 | 出处 | 状态 |
|---|---|---|
| space 加字段会自动持久化、自动恢复 | ZenSpaceManager.mjs L707-L719 写 / L755-L759 读 | 已核验 |
| 读取侧只删 hasCollapsedPinnedTabs 一个临时字段 | 同文件 L774-L777 | 已核验 |
| 落盘原样赋值 | ZenSessionManager.sys.mjs L791 | 已核验 |
| 最干净的挂点 | gZenWorkspaces.addChangeListeners()，L305 | 已核验 |
| 官方自己也这么用 | ZenSpaceCreation.mjs L357 | 已核验 |
| 分屏 API | gZenViewSplitter.splitTabs(tabs, gridType)，ZenViewSplitter.mjs L1430 | 已核验 |

# 三、实施步骤（按依赖顺序）

## 步骤 1：给 space 加 kokoaSessionId 字段

**改动量极小** —— 因为 TASK-05 证明没有字段白名单。

改 `src/zen/spaces/ZenSpaceManager.mjs` 两处：

```
a) 建 space 时给默认值（#createWorkspaceData 附近）
   kokoaSessionId: null,

b) 读取侧 L774-L777 的 delete 之后
   若 workspace.kokoaSessionId === undefined 则补 null
   —— 为了兼容【旧 profile 里已有的 space】（它们没有这个字段）
```

> **不必改**：getWorkspacesForSessionStore（浅拷贝已覆盖）、
> restoreWorkspacesFromSessionStore（原样装入已覆盖）、会话存储层。

## 步骤 2：新建 Kokoa 模块承接会话逻辑

**不改 Zen 的核心切换逻辑。** 新建 `src/zen/kokoa/KokoaWorkspaceSessions.mjs`。

```
1) 启动时挂监听：
   gZenWorkspaces.addChangeListeners(async ({ workspace, onInit }) => {
     if (!workspace || !workspace.kokoaSessionId) return;
     // 把 sessionId 推给 AI 面板
   });

2) 新建会话时回写：
   workspace.kokoaSessionId = newId;
   【待验证】是否需要显式触发保存 —— TASK-05 说写入是事件驱动的，
             但没验证「改了字段会不会立刻落盘」。

3) 关 space 时收尾
```

注册（照 TASK-04 的清单）：

```
src/zen/common/ZenPreloadedScripts.js        加一行加载
src/zen/kokoa/jar.inc.mn                     映射 chrome://
src/browser/base/content/zen-assets.jar.inc.mn   汇总 include
```

## 步骤 3：AI 工作区与网页同级分屏

TASK-03 给了**可照抄代码**。关键点：

```
gZenViewSplitter.splitTabs([target, aiTab], "vsep");   // 左右分栏
完成事件: "ZenViewSplitter:SplitViewActivated"
限制: tab 数 2 ~ MAX_TABS(=4)
【参数不合法时会静默 return，不报错】-> 必须自己加断言：
  gBrowser.tabpanels.hasAttribute("zen-split-view")
```

## 步骤 4：设置页（可后做）

按 TASK-06：新增 4 个文件 + 改动 4 处。

**它发现的陷阱**：preferences-js.patch L27 的展开条件是
`categoryName.startsWith("paneZen")` —— 我们的 `paneKokoa` **不会命中**。
它给了两个解法，并【认为】把分类名叫 `paneZenKokoa` 更省事（少改一行）。

# 四、风险与未知（**必须正面处理**）

| 项 | 性质 | 应对 |
|---|---|---|
| addChangeListeners 在切换【完成后】才触发 | TASK-02 标为【我认为】 | 若需切换前拦截，得 patch changeWorkspace；先按最简单做 |
| 改了字段会不会立刻落盘 | 未验证 | 改完重启看字段在不在 |
| 旧 profile 的 space 没有新字段 | 兼容性 | 步骤 1(b) 已处理 |
| dsh 会话生命周期归谁 | 设计问题，源码里没答案 | 需产品决策 |

# 五、最小可验证的第一步（**建议先做**）

```
不做完整功能，只做【可观测】的最小闭环：

1. 给 space 加 kokoaSessionId（步骤 1）
2. 在 addChangeListeners 回调里 console.info 打印它
3. 构建 -> 切换工作区 -> 看控制台是否打印、值是否正确
4. 重启 -> 看值是否还在（验证持久化）

【不碰任何现有逻辑】，风险最低，但能验证整条链路。
```

> 构建 3 小时，所以第一步要尽量小、尽量可观测。

# 六、我没查清的

```
❓ gZenWorkspaces.getWorkspaceFromId 的确切 API（TASK-02 没给）
❓ 改 space 字段后是否需要显式触发保存（TASK-05 未验证写入时机）
❓ dsh 侧如何「结束一个会话」（那是 dsh 的 API，不在 Zen 源码里）
❓ AI 面板如何响应「切换会话」（我们的面板接口还没有）
```

---

# ★ 重大修正（2026-09-15）：我原来的方案是错的

## 错在哪

我原来写「给 AI 标签的 URL 加 sessionId 参数」。

**主线代码里有一条实测结论直接否掉了它**（`apps/gecko-shell/.../boot.js` L1253-L1259）：

```
· dsh web 地址【当前不含会话 id】：页面只认 ?token=
  拿到 cookie 后 302 到干净根路径；
  全量扫 dsh 客户端产物（dsh-web-frontend/dist + 所有 dsh-client-* 的 lib/client.js）：
    pushState 0 处、location.hash 0 处、window.history 0 处
  ——【没有任何 URL 路由】
· dsh 自己唯一带会话 id 的 URL 形态是它的 HTTP 约定 sessionId=session-<uuid>
  （dsh-session-log-export/lib/client.js:105-107 的 /api/session.export）
· 今天真正可观测的「这个标签是哪个会话」信号是【标签标题】：
  dsh 会把当前会话标题写进 document.title（"<会话标题> — <产品名>"，
  dsh-client-ui-layout/lib/client.js:62），外壳能直接读 contentTitle
```

**所以：往 URL 里塞 sessionId 是无效的 —— dsh 前端根本不读 URL 路由。**

## 正确方案（主线已经实现，可直接照抄）

### 绑定信号有三个，按可靠性排序

| 信号 | 怎么用 | 可靠性 |
|---|---|---|
| **URL fragment `#kokoa-ws=<id>`** | 外壳自己写进 AI 标签 URL；**dsh 不读**（已验证 0 处 hash 使用），无副作用 | ✅ 外壳完全可控 |
| **标签标题** | dsh 写 `"<会话标题> — <产品名>"`，用 ` — ` 分割取前半 | ✅ dsh 侧真实存在 |
| **HTTP API** | `/api/session.export` 等，参数 `sessionId=session-<uuid>` | ⚠️ 要发请求 |

### 主线已有的实现（全部可照抄）

```js
// 1) 工作区标识：URL fragment
const WS_FRAG = "#kokoa-ws=";
function openAiTab(win, wsFrag) {
  const url = panelUrl() + (wsFrag || "");   // 形如 <base>/#kokoa-ws=<id>
  return win.gBrowser.addTab(url, {...});
}

// 2) 关键坑：比较 URL 时必须【同时】切掉 ? 与 #
function aiTabBase() {
  // ★ 只切 "?" 的话 findAiTab 再也认不出 AI 标签（分屏/复用会全部失配）
  return urlBase(panelUrl());
}
function findAiTab(win) {
  const base = aiTabBase();
  for (const t of win.gBrowser.tabs) {
    const spec = t.linkedBrowser?.currentURI?.spec;
    if (spec && urlBase(spec) === base) return t;
  }
  return null;
}

// 3) 从标签标题提取会话标题
function sessionTitleFromTabTitle(title) {
  const s = String(title || "").trim();
  if (!s) return null;
  const i = s.lastIndexOf(" — ");      // U+2014 em dash，前后有空格
  if (i <= 0) return null;              // 没有分隔符 = 还是产品标题本身
  return s.slice(0, i).trim() || null;
}

// 4) 会话 id 的格式（UUID）
const SESSION_ID_RE = new RegExp(
  "session-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
);
```

### 原 `sessionIdFromUrl()` 的四种取法（保留，作为兜底）

`boot.js` L1297-L1331 实现了四级回退：

```
① query 上的会话参数（sessionid / session_id / session / kokoa-session）
② fragment 上的同上
③ 路径形态 /session/<id>
④ 都没有 -> { id: null, source: "none" }   【不编造】
```

## 修正后的实施步骤

**替换原来的「步骤 1/2」中关于 URL 的部分：**

```
步骤 1（不变）给 space 加 kokoaSessionId 字段

步骤 2（修改）：
  a) 打开 AI 标签时带上工作区 fragment：
       gBrowser.addTab(panelUrl() + "#kokoa-ws=" + space.uuid, {...})
  b) 查找 AI 标签时【同时切掉 ? 与 #】再比较
       （这是主线踩过的坑，注释里写得很清楚）
  c) 会话 id 的获取：
       - 优先：URL 里有 sessionId= 就取（可能是我们或 dsh 写的）
       - 其次：读标签标题，用 sessionTitleFromTabTitle 提取
       - 都没有：null（不编造）
  d) 切换工作区时（addChangeListeners）：
       按 workspace.uuid 找到对应 AI 标签并激活它
```

## 教训

**我在写实施计划时，没有先去读主线已经解决过的同类问题。**

主线旧外壳做的是【同一件事】（AI 工作区与网页绑定），而且它已经把 dsh 的
URL 行为、会话 id 格式、可观测信号全部实测过了。**这些结论就写在它的代码注释里。**

> 我花了几轮去「设计」一个主线早就验证过不可行的方案。
> **应该先搜主线的既有实现，再设计新方案。**

这条已写进本文，作为流程提醒。
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

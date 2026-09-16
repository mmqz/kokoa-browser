# 工作项：Kokoa AI 面板接口设计

> 依据：`docs/known-facts-from-mainline.md`（从主线提取的 dsh 实测结论）
> 目的：设计「AI 工作区」在浏览器里怎么呈现、怎么与 dsh 通信。

---

# 一、先确认现状（**实测**）

## 分支上【没有】可用的 AI 面板

扫 `src/` 下所有 AI 相关引用，只有 5 处：

```
browser-box-inc-xhtml.patch:36   <splitter id="ai-window-splitter" ...>   <- 只有一个分隔条
CustomizableUI-sys-mjs.patch:50  -          "ai-window-toggle",          <- 被【删除】了
CustomizableUI-sys-mjs.patch:62  -          "ai-window-toggle",          <- 同上
zen-single-components.css:50     #ai-window-toggle,                      <- 只剩 CSS
tests/.../test_restore_aiwindow.py                                       <- 测试
```

**结论：Zen 曾经有 AI 窗口（`ai-window-toggle` + `ai-window-splitter`），
后来把入口按钮从 `defaultPlacements` 里【移除了】，配套窗格也没有。**

**所以我们要自己造。** 但 `#ai-window-splitter` 还在，说明【窗口级分屏的容器位置已留好】。

# 二、可用的通信手段（**全部来自主线的实测结论**）

## 2.1 dsh 前端【没有 URL 路由】—— 别指望用 URL 传参

```
全量扫 dsh 客户端产物：pushState 0 处、location.hash 0 处、window.history 0 处
```

**所以「打开某个会话」不能靠 URL。**

## 2.2 三个可用的信号（按可靠性）

| 信号 | 方向 | 说明 |
|---|---|---|
| **URL fragment `#kokoa-ws=<id>`** | 外壳 → 自己 | 外壳写，dsh 不读（无副作用），外壳随时能读回来 |
| **标签标题** | dsh → 外壳 | dsh 写 `document.title = "<会话标题> — <产品名>"` |
| **HTTP API** | 外壳 → dsh | `sessionId=session-<uuid>`（它的 HTTP 约定） |

## 2.3 ★ 一个必须遵守的约束

```
比较 URL 判断「是不是同一个 AI 标签」时，必须【同时切掉 ? 和 #】。
只切 "?" 的话，findAiTab 再也认不出 AI 标签（分屏/复用会全部失配）。
```

# 三、接口设计（**基于以上事实**）

## 3.1 三个概念要分清

```
工作区（space）  —— Zen 的，有 uuid
AI 标签          —— 一个加载了 dsh 的普通 tab
dsh 会话         —— dsh 内部的，id 形如 session-<uuid>
```

**关系**：一个工作区 可以有 0..N 个 AI 标签；一个 AI 标签挂在一个工作区下。

## 3.2 绑定关系（我们维护）

```js
// space 上（见 workitem-workspace-session-binding.md 步骤 1）
space.kokoaSessionId = "session-<uuid>" | null

// AI 标签的 URL（外壳自用）
<panelUrl>#kokoa-ws=<space.uuid>
```

**为什么不把 sessionId 也写进 URL？**
因为 2.1 已证 dsh 不读 URL，写进去只有外壳能读 ——
但**外壳可以从标签标题拿到会话信息**（2.2），所以没必要重复存。

## 3.3 面板的呈现方式（**两个候选，需要决策**）

### 候选 A：右侧栏（与网页分屏）

```
优点：符合「AI 与网页同级」的产品主张
      可用 Zen 的 gZenViewSplitter.splitTabs([target, aiTab], "vsep")
缺点：占用横向空间
```

### 候选 B：`#ai-window-splitter` 那个位置（Zen 留好的）

```
优点：Zen 已经留了 splitter（browser-box-inc-xhtml.patch L36）
缺点：【不知道它原本配套的窗格在哪】（已被移除）
      要自己补齐，而且它在 tabbrowser-tabbox 内，语义不明
```

**我倾向 A**，理由：

```
- TASK-03 已验证 splitTabs 可用，路径清晰
- 「分屏」是产品主张里明确的（AI 工作区和网页同等重要）
- 候选 B 的语义未查清，风险高
```

> 这是**我的判断，非实测结论**。而且这实际是个**产品决策**，不是技术判断。

# 四、最小可验证的第一步

```
1. 工具栏按钮打开一个加载 dsh 的标签（【已做】，见 f557b52）
2. 按钮再点一次，若已有该工作区的 AI 标签则激活它（而不是再开一个）
   —— 这一步能验证 findAiTab 的逻辑（含「同时切掉 ? 和 #」那个坑）
3. 用 splitTabs 把它与当前网页并排
4. console.info 打印「当前标签的会话标题」（sessionTitleFromTabTitle）
   —— 验证能不能从标签标题拿到会话信息
```

**四步都不碰 Zen 的核心逻辑，全部在我们已经改过的 `zen-sets.js` 里扩展。**

# 五、我没查清的（2026-09-16 云端调研后：三个都解决了）

> 调研报告：`docs/dsh-0.1.5-interface.md`（dsh@0.1.5-rc.1 源码逐文件读，
> 每条结论带 包名+文件+行号）。原文留档如下，现状见括号内。

```
✅ /api/session.export 等接口的确切签名
   （GET /api/session.export?sessionId=<id>&includeDescendants=true；
    一元 RPC 全表 + session/list 的完整 schema 已记录）
✅ 从 dsh 标签「切到某个会话」到底能不能做到
   （【做不到】—— 当前会话是页面本地状态，无 URL 路由、无外部触发通道，
    重载也只会落到最近工作区的空白/新建会话。产品边界，不是分支能绕的）
✓ dsh 有会话列表接口（POST /api/session/list，items 含 title/running/blank/cwd）
   —— 已落地：src/zen/kokoa/KokoaDshSessions.mjs（49 用例，Node 可测）
❓ #ai-window-splitter 原本配套的窗格是什么（Zen 移除了什么）
   （仍未查清，可查 Zen 的 git 历史或旧版本）
```

# 六、风险（2026-09-16 更新）

| 风险 | 应对 |
|---|---|
| ~~dsh 没有「切换会话」的接口~~ | **已证实**：切换=页面本地状态，外壳无法驱动。产品形态改为【列表展示 + 引导用户在 dsh 内切换】；强需则向 dsh 上游提 deep-link |
| ~~会话 id 拿不到~~ | session/list 直接给 sessionId + title，id 不再只靠标题猜 |
| `#ai-window-splitter` 语义不明 | 先用候选 A（splitTabs），不碰它 |
| dsh 是 0.x，接口随版本漂移 | KokoaDshSessions 的响应解析是严格模式（形状不对即报错）；升级 dsh 后按 dsh-0.1.5-interface.md 第八节复跑调研 |

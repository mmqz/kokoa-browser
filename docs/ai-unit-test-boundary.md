# AI 模块的单测边界（2026-09-16，纠正我之前的错误判断）

> 我之前一直说「AI 逻辑必须等完整构建 + 实机测」。
> **这个说法只对了一半** —— 大部分逻辑其实【不需要浏览器】。
> 用户一句「ai 模块单测不行吗」点醒了我。

---

# 一、结论

| 层 | 能不能 Node 单测 | 为什么 |
|---|---|---|
| 纯函数（urlBase / hasToken / 正则） | ✅ 能 | 不碰浏览器 |
| **行为逻辑**（findAiTab / openAiTab / split / 会话绑定） | ✅ **能** | 浏览器 API 只在【函数体内】用，且 win 是【参数】 |
| dsh 能否被真拉起 | ❌ 不能 | 要真进程（Subprocess） |
| 模块能否被 `resource:///` 导入 | ❌ 不能 | 要真构建（由产物核对覆盖） |
| UI 真实表现 | ❌ 不能 | 要实机 |

**关键**：完整构建 2.5 小时一轮。
能在 Node 里秒级验证的，就【不要等构建】。

---

# 二、怎么做到的

## 2.1 前提：浏览器 API 在【函数体内】，不在模块顶层

```js
export function findAiTab(win) {        // win 是【参数】-> 可传假的
  const gb = win?.gBrowser;             // 测试造一个 { gBrowser: {...} }
  ...
}
```

如果模块顶层就 `const x = Services.xxx`，Node import 就会炸。
我们这几个模块【刚好不是】—— 值得保持这个写法。

## 2.2 注入全局（在 import 之前）

```js
globalThis.Services = {
  env: { get: () => "" },
  scriptSecurityManager: { getSystemPrincipal: () => ({}) },
};
globalThis.window = { gZenViewSplitter: null };   // 分屏读它
globalThis.gZenWorkspaces = null;                 // 会话绑定读它
```

## 2.3 造假窗口

```js
function fakeWin(tabs) { /* gBrowser.tabs / addTab / selectedTab */ }
function fakeSplitter() { /* splitTabs / unsplitCurrentView，记录调用 */ }
function fakeWorkspaces(o) { /* activeWorkspace / getSpaceSessionId / ... */ }
```

---

# 三、★ fake 必须【对齐真实实现】

**这是我的教训**：第一版 fake 的 `updateSpaceSessionId` 只【记录调用】，
没有【写回对象】。于是测试报「写了读不到」——
**看起来像代码的 bug，其实是我 fake 的错。**

真实实现（`ZenSpaceManager.mjs L1275`）：
```js
workspace.kokoaSessionId = sessionId || null;
this.saveWorkspace(workspace);
```

所以 fake 也必须写回 `workspace.kokoaSessionId`。

**规则**：fake 不是"能跑就行"，要照着真实实现抄语义。

---

# 四、★ 测试反过来查出我两处【对 API 的误记】

这两处如果照我原来的理解写进代码，**实机必挂**：

| 我以为的 | 真实的 |
|---|---|
| `splitTabs(tabA, tabB)` | `splitTabs(tabs[], "vsep", 1)` |
| `unsplitTabs(tab)` | `unsplitCurrentView()`（前者 Zen 里【不存在】） |

第二处源码注释里已经记过一次，现在用测试钉死。

---

# 五、Node 里的一个坑：裸标识符 vs window

`KokoaWorkspaceSessions.mjs` **混用**两种写法：
- 检查：`window.gZenWorkspaces`（L110/L133）
- 使用：裸 `gZenWorkspaces`（L53/L119/L134/L158）

浏览器里裸标识符会解析成 window 属性，所以能跑；
**Node 没有隐式全局 -> ReferenceError**。

测试里显式建了同名全局指向同一对象。
源码暂不改（它在浏览器里是对的，改它属于另一类改动，且要过构建）。

---

# 六、现在的测试清单

```
KokoaAiPanel.test.js                    16   纯函数（urlBase / hasToken）
KokoaAiPanel.behavior.test.js           35   行为（复用 / 分屏 / toggle）
KokoaDshSidecar.test.js                  9   dsh URL 解析
KokoaMenubar.test.js                    10   菜单契约
KokoaWorkspaceSessions.behavior.test.js 24   会话绑定
                                       ────
                                        94
```

**每个都做过双向验证**（故意改坏 -> 确认失败 -> 恢复 -> 确认全绿）。

---

# 七、仍然【真的】要实机的（别自欺）

- dsh 能否被 `Subprocess.call` 真的拉起来
- 模块能否被 `resource:///modules/zen/...` 导入（要真构建）
- 分屏的视觉效果
- 设置页能否展开

**这些等构建产物出来后核对 / 实机点。**

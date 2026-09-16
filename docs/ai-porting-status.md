# AI 功能移植 —— 现状（2026-09-15/16）

> 本文是 `workitem-ai-porting.md` 的【执行结果】。
> 移植已全部落地，但**只有静态检查通过，运行时验证待做**。

---

# 一、已完成（12 个提交）

## 1.1 核心模块（4 个 .mjs）

| 文件 | 作用 | 依据 |
|---|---|---|
| `src/zen/kokoa/KokoaAiPanel.mjs` | 拿面板 URL / 找 AI 标签 / **复用** | 主线 boot.js panelUrl/urlBase/findAiTab/openAiTab |
| `src/zen/kokoa/KokoaDshSidecar.mjs` | **拉起 dsh** / 从 stdout 拿带 token 的 URL | 主线 startSidecar/stopSidecar/findNode + 我实测的 dsh web 接口 |
| `src/zen/kokoa/KokoaAiSplit.mjs` | 与网页**并排**（用 Zen 原生分屏） | ZenViewSplitter.splitTabs/unsplitCurrentView |
| `src/zen/kokoa/KokoaWorkspaceSessions.mjs` | 工作区↔会话联动 | gZenWorkspaces.addChangeListeners（官方钩子） |

**注册方式**：`src/zen/kokoa/moz.build` 的 `EXTRA_JS_MODULES.zen`
→ `resource:///modules/zen/<名字>`

## 1.2 用户入口

| 入口 | 位置 |
|---|---|
| **AI 工作区按钮** | 工具栏（原有，已改造为「先拉起 dsh」） |
| **AI 分屏按钮** | 工具栏（新增） |
| **两个命令** | `cmd_kokoaOpenAiWorkspace` / `cmd_kokoaToggleAiSplit` |
| **Kokoa 设置页** | about:preferences 的 Kokoa 分类（含 AI 节） |

## 1.3 存储

`ZenSpaceManager.mjs`：
- `#createWorkspaceData` 加 `kokoaSessionId: null`
- 读取侧兼容旧 profile（补 null）
- 新增 `updateSpaceSessionId(uuid, id)` / `getSpaceSessionId(uuid)`

**依据**：TASK-05（持久化无白名单）+ TASK-08（同步是白名单，不会被带走）

## 1.4 顺带修的贴牌

- 欢迎页的大标题（Zen slogan）→ 删掉
- 新标签页的 logo → 用官方 pref `hideLogo: true` 隐藏

---

# 二、★ 关键突破：dsh web 的接口（实测）

```
命令：  dsh web --no-open --port <port>
        （dsh web 是 dsh --profile web 的别名）

它把带 token 的 URL 【打印到 stdout】：
  dsh web: http://127.0.0.1:18318/?token=bGKA4eWx5Ukw5pheygSZclININa7Qc2EmNGQWIDOSw0
```

**这解决了用户报的问题**：
```
之前：点按钮 -> 打开一个连不上的 URL
      -> "dsh web authentication required; reopen the URL printed by dsh web."

现在：点按钮 -> 确保 dsh 在跑 -> 拿带 token 的 URL -> 打开
```

---

# 三、★ 移植时继承的坑（主线踩过，都写进注释了）

## Subprocess 三条硬约束（主线读源码所得）
```
1. command 必须【全路径】（$PATH 不搜）
2. environment 不带 environmentAppend:true 会【整体替换】继承环境
3. stdout 恒为管道，不持续读会【阻塞】
```

## Windows PATHEXT 坑
```
没有 PATHEXT 时 pathSearch 只做精确名匹配（"node" 匹配不到 node.exe）
-> 逐个候选名试
```

## 「同时切掉 ? 与 #」
```
比较 URL 判断是不是同一个 AI 标签时必须【同时切掉 ? 和 #】。
只切 "?" 的话 findAiTab 再也认不出标签（分屏/复用全部失配）。
```

---

# 四、验证进度（2026-09-16 更新）

> ⚠️ 这一节【重写过】。原文说「只有静态检查过，运行时待做」，
> 现在有一部分【已经验证了】—— 而且验证点比预想的靠前。

## 4.1 ✅ 已验证（构建 35047911545）

| 项 | 状态 | 怎么验证的 |
|---|---|---|
| 模块能否被真的 import | ✅ | 从 omni.ja 抽出模块，**跑我们的单测 104/104 全过** |
| 模块真的进包了 | ✅ | 产物里 `modules/zen/Kokoa*.mjs` 4 个都在 |
| 行为与源码一致 | ✅ | 对【产物里的模块】跑行为测试，结果与源码相同 |

**关键改进**：以前「模块能被 import」只能靠实机测。
现在有 `scripts/verify-artifact-modules.sh` —— 产物一下载就能验。

## 4.2 ⏳ 仍要实机（单测覆盖不到）

```
· dsh 能否被真的拉起（Subprocess.call 要真进程）
· 分屏的视觉效果
· 设置页能否真的展开（paneKokoa 的条件）
· 菜单项是否真的隐藏了
```

见 `docs/manual-test-checklist.md`（构建出来后照着点）。

## 4.3 一个已修的构建教训（保留作记录）

```
第一次构建（35007320104）成功，但 4 个模块【不在产物里】。
原因：src/zen/moz.build 的 DIRS 没登记 kokoa 子目录。
-> 已修 + 加了检查（check_mozbuild_dirs）
-> 构建 35032271818 已确认模块真的进包 ✅
```

---

# 五、剩下的工作（2026-09-16 更新）

## 5.1 ✅ 已完成

```
· 等构建确认模块进包         -> ✅ 35032271818 确认
· 二级菜单可配置             -> ✅ 已实现（待 35056127083 验证）
· 单测覆盖                   -> ✅ 119 个用例，7 个文件
```

## 5.2 ⏳ 剩下（要实机）

```
· 实机点一遍 AI 工作区 / 分屏 / 设置页 / 菜单
  见 docs/manual-test-checklist.md
```

## 5.3 之后再说（不阻塞）

```
· 会话切换（dsh 怎么切会话还没查清 —— workitem-ai-panel-interface.md）
  现状：KokoaWorkspaceSessions 【故意只记录状态】，等接口查清再接
· AI 工作区侧栏（workitem-ai-workspace-sidebar.md）
  现状：【未实现】。但它是增强 —— 现在用「标签页 + 分屏」已经能用
· branding 图标替换（现在还是 Zen/Firefox 图标）
```

**完整盘点见 `docs/remaining-to-done.md`。**

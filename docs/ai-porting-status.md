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

# 四、⚠️ 未验证的（**重要**）

## 4.1 运行时行为（只有静态检查过）
```
· 4 个模块能否被真的 import（resource:///modules/zen/...）
· dsh 能否被真的拉起（Subprocess.call 的用法）
· 分屏能否真的工作
· 设置页能否真的展开（paneKokoa 的条件）
```

**这些要等构建产物 + 实机测试。**

## 4.2 一个已知的构建教训
```
第一次构建（35007320104）成功，但 4 个模块【不在产物里】。
原因：src/zen/moz.build 的 DIRS 没登记 kokoa 子目录。
-> 已修 + 加了检查（check_mozbuild_dirs）
-> 但仍需【下次构建】确认模块真的进包
```

---

# 五、剩下的工作

## 5.1 短期
```
· 等构建确认模块进包
· 实机测：点 AI 工作区按钮 -> dsh 起来 -> 面板打开
· 实机测：点 AI 分屏 -> 与网页并排
· 验证：设置页的 Kokoa 分类能展开
```

## 5.2 中期（见各工作项）
```
· 会话切换（dsh 怎么切会话还没查清 —— 见 workitem-ai-panel-interface.md）
· 二级菜单可配置（workitem-menubar-configurable.md）
· AI 工作区侧栏（workitem-ai-workspace-sidebar.md）
```

---

# 六、文档索引

| 文档 | 内容 |
|---|---|
| `workitem-ai-porting.md` | 移植方案（本文是它的执行结果） |
| `workitem-ai-panel-interface.md` | AI 面板接口设计 |
| `workitem-workspace-session-binding.md` | 会话绑定（含我的重大修正） |
| `workitem-menubar-configurable.md` | 二级菜单可配置 |
| `workitem-kokoa-settings.md` | 设置页 |
| `known-facts-from-mainline.md` | **从主线提取的实测结论**（dsh/Subprocess/DOM） |
| `build-metadata-conventions.md` | 构建元数据约定（踩 5 次坑后整理） |
| `kokoa-module-registration.md` | 模块注册/导入方式 |

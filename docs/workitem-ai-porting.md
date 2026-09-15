# 工作项：AI 功能移植（从主线旧外壳 → 分支）

> 来源：用户要求开始 AI 功能的移植。
> **本文是先摸清现状 + 定方案**，不是直接动手。

---

# 一、两边现状

## 1.1 主线（旧外壳）：AI 功能【完整可用】

```
文件：apps/gecko-shell/omni-overlay/chrome/browser/content/browser/kokoa/boot.js
      （在 E:\Code\ai\kokoa-workspace\kokoa 下）
规模：3036 行
形态：注入到 Firefox 的一段脚本（omni.ja 覆盖 + browser-main.js 里 loadSubScript）
```

### 它的 AI 相关函数（移植地图）

| 函数 | 行 | 作用 | 我们有没有 |
|---|---|---|---|
| `envGet` / `normPath` / `exeDirPath` / `findRepoRoot` | 37-86 | 定位仓根 | 无 |
| `ensureConfDir` / `writeFile` / `readFile` | 87-146 | 配置目录读写 | 无 |
| **`panelUrl()`** | **154** | **拿带 token 的面板 URL** | **已有**（zen-sets.js 已抄） |
| `injectStyle` / `buildPanel` / `buildButton` | 172-257 | 自建面板与按钮 | 无（我们用 Zen 机制） |
| `force` / `forceOverlay` | 278-361 | 强制布局（对抗式） | **不该抄**（见第四节） |
| **`findNode()`** | **435** | 找 node.exe（Windows PATHEXT 坑） | 无 |
| `drainStdout(proc)` | 479 | 读子进程输出（防阻塞） | 无 |
| **`startSidecar()`** | **504** | **拉起 dsh sidecar（最核心）** | **缺口** |
| `stopSidecar(reason)` | 627 | 收尾 | 无 |
| `probeBridge(timeoutMs)` | 380 | 探测 dsh 是否就绪 | 无 |
| `buildWorkspaceSidebar` / `refresh` | 735-853 | 工作区侧栏 | 无（有独立工作项） |
| **`aiTabBase` / `findAiTab` / `openAiTab`** | **1038-1074** | **AI 标签管理** | 部分（能开，不能复用） |
| `toggleAiSplit(win)` | 1075 | AI 与网页分屏 | 无 |

## 1.2 分支（我们）：只有骨架

```
src/zen/common/zen-sets.js 的 cmd_kokoaOpenAiWorkspace：
  · 三级回退拿 URL（env -> 文件 -> 硬编码）      已有
  · gBrowser.addTab(url) 开成普通 tab            已有
  · skipRoute: true（防被 space-routing 挪走）   今天刚加
  · 【没有】拉起 dsh sidecar                     缺口
  · 【没有】findAiTab（复用而非重复开）           缺口
  · 【没有】与网页分屏                           缺口
```

---

# 二、移植的关键难点：形态不同

```
主线：注入式（omni.ja 覆盖 + loadSubScript）
  -> 可以随便操作 DOM、自建面板、用 force 强制布局

我们：源码级（Zen 的源码树）
  -> 应该用 Zen 的机制，而不是抄主线的对抗式手法
```

## 移植原则

```
1. 逻辑可抄，实现要按 Zen 的方式重写
   例：startSidecar 的逻辑可以照抄（Subprocess 是 Firefox 的 API，两边一样）
       但 buildPanel / forceOverlay 【不要抄】（那是无奈之举，见 ADR-017）

2. 优先找 Zen 自己的对应机制
   例：AI 标签分屏 -> 用 gZenViewSplitter.splitTabs（TASK-03 已验证）
       AI 面板宿主 -> 用 Zen 的 panel 机制（TASK-04 已查）

3. 主线已验证的坑要继承（见第三节）
```

---

# 三、主线踩过的坑（移植时必须继承）

## 3.1 Subprocess 的三条硬约束（主线 L330-L342，读源码所得）

```
1. options.command 必须是【全路径】
   源码原文：Relative paths are not accepted, and $PATH is not searched.
   -> 必须先 Subprocess.pathSearch("node")

2. 传 options.environment 不带 environmentAppend:true 时，
   environment 会【整体替换】继承环境 -> node 会失去 PATH
   -> 要么用 environmentAppend:true，要么把环境补全

3. 子进程【stdout 恒为管道】
   不持续读，缓冲区满后子进程写操作会【阻塞】
   -> 必须 drain（主线有 drainStdout）
```

## 3.2 Windows 的 PATHEXT 坑（主线 L444-L448，源码+实测）

```
pathSearch 的 Windows 实现：
  if (environment.PATHEXT) exts = environment.PATHEXT.split(";");
即【没有 PATHEXT 时 exts 为空】，只做精确名匹配 -- node 匹配不到 node.exe
实测：sidecar_error=pathSearch(node): Executable not found: node
-> 逐个候选名试（node.exe / node.cmd / ...），不依赖 PATHEXT
```

## 3.3 父进程死亡兜底（主线 L341-L342）

```
spawn 时带 KOKOA_PARENT_PIPE=1，sidecar 监视 stdin；
父进程句柄释放 -> 管道 EOF -> 自行退出
（覆盖 quit-application 未触发的场景）
```

## 3.4 端口约定

```
BRIDGE_PORT = 8318
HEALTH_URL  = http://127.0.0.1:8318/kokoa/health
主线实测：8318 曾被 Docker 的 wslrelay 占用并返回 401 -- 要处理
```

---

# 四、移植方案（分阶段）

## 阶段 1：让 AI 面板能真的打开（最小可用）

```
目标：点按钮 -> 若 dsh 没起则拉起 -> 打开带 token 的面板

新增 src/zen/kokoa/KokoaDshSidecar.mjs：
  · findNode()     照抄主线 L435（含 PATHEXT 坑）
  · startSidecar() 照抄主线 L504 的逻辑，但：
      - 入口路径改为我们的
      - 环境变量用 environmentAppend:true
      - 必须 drain stdout
  · probeBridge()  照抄 L380（探测 8318 的 health）
  · stopSidecar()  照抄 L627

改 src/zen/common/zen-sets.js：
  · 打开前先 await KokoaDshSidecar.ensure()
  · 用 findAiTab 复用（照抄主线 L1047）

【一个必须先定的问题】dsh 从哪来？
  · 主线是拉起 apps/sidecar/dist/index.js（仓内的 Node 程序）
  · 我们分支【没有这个程序】
  · 选项：
      a) 用主线的 dsh（跨仓库依赖）-- 不干净
      b) 把 dsh 作为独立组件打包进产物 -- 要决定放哪
      c) 假定用户自己起 dsh -- 体验差（就是现在的问题）
  【需要产品决策】
```

## 阶段 2：AI 标签的管理（复用 / 分屏）

```
· findAiTab(win)     照抄主线 L1047
  注意那个坑：比较 URL 必须【同时切掉 ? 与 #】
· toggleAiSplit(win) 但我们用 gZenViewSplitter.splitTabs（TASK-03 验证过）
  而不是主线的 forceOverlay 手法
```

## 阶段 3：与工作区绑定

```
· 已在 workitem-workspace-session-binding.md 规划
· TASK-08 证明：加字段不会被同步带走（白名单）
· 只需改 2 处（ZenSpaceManager）
```

## 阶段 4：侧栏化（可选）

```
主线有 buildWorkspaceSidebar（L735）
我们在 workitem-ai-workspace-sidebar.md 规划过
【注意】TASK-10 查出：AI 面板放 sidebar 里会随 compact-mode 折叠隐藏
```

---

# 五、我不确定的地方（需要先查）

```
1. dsh 从哪来（阶段 1 那个问题）-- 需要产品决策
2. Zen 的 Subprocess 用法与主线有没有差异
   （Subprocess 是 Firefox 的，理论一样，但 Zen 可能有自己的封装）
3. 我们的产物有没有 Node 运行时
   （主线依赖系统 node；产物里没有就得带一个）
4. sidecar 的构建与打包（apps/sidecar 在主线里是个 npm 工程）
```

# 六、我建议的第一步

```
【先解决 dsh 从哪来】-- 那是阶段 1 的前置，也是现在体验差的原因。

在它确定之前，移植 startSidecar 没法写：
  · 不知道入口路径，SIDECAR_ENTRY_REL 就没法定
  · 不知道有没有 Node，findNode 的意义也不同

所以：
  1. 先定 dsh 的来源（产品决策）
  2. 再写 KokoaDshSidecar.mjs
  3. 再改 cmd_kokoaOpenAiWorkspace

【在等你决定期间，我可以先做的】
  · 把 findAiTab（复用逻辑）实现 -- 不依赖 dsh 来源
  · 那是阶段 2 的一块，而且能立刻改善体验（不重复开标签）
```

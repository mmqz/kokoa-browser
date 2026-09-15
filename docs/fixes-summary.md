# 进度：从「能编」到「能用」的修复清单（2026-09-15）

> 现状：**Kokoa 已经能启动并进入主界面**（用户确认「进去了完美」）。
> 本文记录此后发现的问题与修复。

---

## 已修（等待构建验证）

### 1. 菜单文字缺失 / Zen 文案缺失

**根因**：CI 跳过了 `scripts/download-language-packs.sh`。
（**这是我在工单里写错的建议** —— 我写过「可以先跳过，省时间」。）

**证据**：

```
我们的 browser/omni.ja    12906 条目
官方 Zen 的 browser/omni.ja 13393 条目
差集 533 个文件 —— 【全部是 zen-*】
  例：localization/zh-CN/browser/zen-command-palette.ftl
```

**为什么不能跳过**：该脚本的 `copy_language_pack.py` 是**把 Zen 文案搬进构建的唯一途径**
（`locales/<lang>/` -> `engine/browser/locales/` -> 打进 omni.ja 的 `localization/`）。

**修法**：workflow 加回该步骤（在 Import 之后）。
**代价**：它会 `git clone` 整个 `mozilla-l10n/firefox-l10n`（非浅克隆），时间与磁盘需重新测量。

### 2. AI 工作区按钮报 dsh authentication required

**根因**：`src/zen/common/zen-sets.js` 硬编码 `http://127.0.0.1:3080/`，**没有 token**。
原注释还写着「URL is a constant on purpose — no config system yet」。

**修法**：照抄主线 `boot.js` 的 `panelUrl()`（L154-L170）三级回退：

```
1. 环境变量 KOKOA_DSH_URL                     <- 启动器注入，带 token
2. <KOKOA_STATE_DIR>/gecko-shell/kokoa-panel.url 文件
3. 硬编码兜底（并 console.warn 提示怎么设）
```

**副产品**：加了 `console.info` 打印 URL 来源，便于以后排查。

**过程中的教训**：第一版用了 `await IOUtils.readUTF8`，但那个命令处理函数**不是 async**。
`node --check` 当场拦下（`SyntaxError: Unexpected reserved word`），改用同步读。
**这正是 `scripts/check.sh` 的价值 —— 秒级发现，不必等 3 小时构建。**

---

## 未修（已定位，未动手）

### 3. 页面卡顿

**未验证的推测**（最可能）：我们的构建**显式关掉了 PGO**（`ZEN_GA_DISABLE_PGO=1`），
而官方 Zen 用**三级 PGO**（构建 -> 采 profile -> 带 profile 重建）。

验证办法：对比官方 Zen 在同一台机器上的顺滑度。

### 4. 贴牌残留（两处）

```
kokoa.exe            CompanyName = Mozilla Corporation
kokoa.installer.exe  ProductName = Firefox / CompanyName = Mozilla
```

**根因（外部代理查得更深，应采信它的方案）**：
- surfer 的 `configureBrandingNsis()` 本来会生成 `CompanyName = vendor`（= Kokoa）
- 但同文件的 `copyMozFiles()` 会先用 `unofficial/` 覆盖
- 真正该改的是 **`MOZ_APP_VENDOR`**，以及 `moz-configure.patch` 里 Zen 残留的
  `default="Zen Team"`

详见 `docs/branding-crosscheck.md`（两边独立调研的对比）。

---

## 方法论上的收获

### 教训 1：进程活着 ≠ 界面能用

我连续三次误判「能跑」：

```
错误 1  用「我的 PID 退出」判启动失败  -> 那是 -new-instance 的启动器
错误 2  用「全屏截图纯白」判截错软件  -> 实际是窗口在屏幕上就是空的
错误 3  用「进程数+窗口句柄+profile 文件数」判「能跑」<- 最严重，还写进了提交
```

**判定 GUI 程序能用，必须看画面内容。** 判据要多源交叉。

### 教训 2：「为了省时间先跳过」必须建立在「知道它做什么」之上

我只看脚本名（"语言包"）就推断它只影响多语言，**没读实现** —— 而它实际负责
Zen 全部界面文案的搬运。**已造成实际后果**（533 个文案缺失）。

### 教训 3：测试前先确认被测物完整

我有一次用**残缺的运行时**（只剩 66 个文件，`kokoa.exe`/`xul.dll`/`omni.ja` 都不在）
测出「空白窗口」，还据此下了结论。

### 教训 4：独立调研的价值

贴牌残留那件事，我先查到文件就停了；外部代理继续追到了「为什么赋值没生效」。
**我给出的修法不经验证就不能当结论用。**

---

## 当前构建

```
run 34921851927  提交 f557b52（含两个修复）
它会验证：language packs 步骤能否跑通、产物里 zen-*.ftl 是否回来、
          构建时间与磁盘是否仍在预算内（6 小时上限 / 磁盘余量）
```

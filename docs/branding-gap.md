# 贴牌残留溯源（实测，2026-09-15）

## 结论：根因已定位

**产物里的 `CompanyName = Mozilla Corporation` 不是来自我们的仓库，
而是来自 `engine/`（Firefox 源码树）——我们的 `src/` 覆盖层没覆盖品牌文件。**

### 证据链

**证据 1：整个仓库里【根本不存在】`Mozilla Corporation` 这个字符串**

```
扫描范围：仓库全树（排除 .git / node_modules）
文件类型：.txt .json .js .mjs .h .rc .ini .cfg .py .sh .xhtml .properties
结果：0 处命中
```

**证据 2：`configs/` 下没有品牌【文本】定义，只有图标**

```
configs/branding/release/   <- 全是 .ico/.icns/.png/.svg/.bmp（图标与 logo）
configs/branding/twilight/  <- 同上
configs/common/mozconfig    <- 构建参数
configs/{linux,macos,windows}/mozconfig

没有 .rc / .h / .properties 这类放 CompanyName 的文件
```

**证据 3：`src/` 下没有 branding 目录**

```
src/ 下含 branding 的目录：0 个
build/ 下含 branding 的目录：0 个
prefs/ 下含 branding 的目录：0 个
```

**证据 4：`surfer.json` 里没有 CompanyName 字段**

```
buildOptions: { generateBranding: true }     <- 只生成品牌【显示名】
brands.*.brandShorterName / brandShortName / brandFullName  <- 都是显示名
【没有】vendor 之外的任何公司名字段
```

## 因果解释

`surfer.json` 的 `brands.*` 管的是**显示名**（我们改成了 `Kokoa Twilight`，
所以 `ProductName` / `FileDescription` 对了）。

但 **PE 版本资源里的 `CompanyName` 不在它的管辖范围** ——
Firefox 把它定义在 `engine/browser/branding/*/` 下（`.rc` / `.h` 之类），
而我们**从来没有覆盖过那些文件**。所以用的是 Firefox 的默认值 `Mozilla Corporation`。

## 修复方向（待验证）

**方向 A：在 `src/` 里覆盖品牌文件**

surfer 的 `import` 是把 `src/**` 覆盖到 `engine/**`。所以：

```
1. 先找到 engine/ 里定义 CompanyName 的确切文件
   （构建时才有 engine/，本地没有 —— 要么构建产物里翻，要么查 Mozilla 源码）
2. 在 src/ 下【对应的相同路径】建立我们的版本
3. surfer import 时会覆盖掉它
```

**方向 B：看 `generateBranding` 生成的文件能否承载**

`generateBranding: true` 会生成一批品牌文件。如果其中就有那个定义 CompanyName 的
文件，可能改 `surfer.json` 的某个字段就能影响它 —— 但要先确认它生成什么。

## 安装器为什么完全没贴牌（另一条线索）

```
dist/kokoa.installer.exe
  ProductName : Firefox     <- 注意：连 ProductName 都没改
  CompanyName : Mozilla
```

**安装器比主程序还严重**：主程序至少 `ProductName = Kokoa Twilight` 了，
安装器**连 ProductName 都是 Firefox**。
说明 Firefox 的安装器有**完全独立的 branding**（`browser/installer/`），
既不受 `surfer.json` 的 `brands.*` 影响，也没有被我们覆盖。

## 下一步

1. **先找到 engine/ 里这两个文件**（主程序的 CompanyName / 安装器的 ProductName）
   —— 最可靠的办法是**在构建产物里找**，因为 `engine/` 本地没有
   但注意：artifact 里**不含 engine/ 源码**，只有产物。
   所以要么另跑一次带源码的构建，要么直接查 Mozilla 源码树（在线）
2. 找到后在 `src/` 下建同名文件覆盖
3. 重新构建验证 `kokoa.exe` 与 `kokoa.installer.exe` 的版本资源

> ⚠️ **这一条仍未解决**，只是根因定位了。不要当成已修。
---

# ★ 根因已精确定位（2026-09-15 10:0x）

## 找到了那一行

**文件：`browser/branding/official/branding.nsi`**（Firefox 源码树，非本仓库）

```
!define BrandFullNameInternal "Mozilla Firefox"
!define BrandFullName         "Mozilla Firefox"
!define CompanyName           "Mozilla Corporation"      <- 就是这个
!define URLInfoAbout          "https://www.mozilla.org"
!define URLUpdateInfo         "https://www.firefox.com/firefox/${AppVersion}/releasenotes"
!define HelpLink              "https://support.mozilla.org"
```

出处（已实测可取）：
```
https://raw.githubusercontent.com/mozilla-firefox/firefox/release/browser/branding/official/branding.nsi
（HTTP 200，3765 字节）
```

## 为什么这一个文件解释了两处残留

`.nsi` 是 **NSIS 定义**，同时被两处消费：

| 消费方 | 用到的字段 | 我们观察到的现象 |
|---|---|---|
| **主程序的 PE 版本资源** | `CompanyName` | `kokoa.exe` 的 `CompanyName = Mozilla Corporation` |
| **安装器（NSIS）** | `BrandFullName` / `CompanyName` / `URLUpdateInfo` | 安装器 `ProductName = Firefox` / `CompanyName = Mozilla` |

**注意 `URLUpdateInfo` 也在这里** —— 它指向 `www.firefox.com`。
我们的 `surfer.json` 设了 `updateHostname: "updates.kokoa.local"`，
但**那条走的是应用内的更新通道，不是安装器的这个**。两者是不同的东西。

## 为什么 `surfer.json` 的 `brands.*` 没改到它

```
surfer.json 的 brands.* 管：brandShorterName / brandShortName / brandFullName
  -> 这些对应 Fluent 文案（brand.ftl）与部分显示名
  -> 所以 kokoa.exe 的 ProductName = "Kokoa Twilight"，FileDescription 也对

它【不管】：CompanyName、安装器的 ProductName、URLUpdateInfo
  -> 这些在 browser/branding/*/branding.nsi 里，硬编码为 Mozilla 的值
```

## 修复方案（**这是要执行的**）

surfer 的 `import` 会把 `src/**` 覆盖到 `engine/**`。所以：

```
1. 在 src/ 下建立同名文件：
     src/browser/branding/official/branding.nsi
   （以及 twilight/unofficial 两份，如果构建用的是它们）

2. 内容照抄上游，只改这几行：
     !define BrandFullNameInternal "Kokoa"
     !define BrandFullName         "Kokoa Browser"
     !define CompanyName           "Kokoa"
     !define URLInfoAbout          "https://github.com/tomjiu/kokoa-browser"
     !define URLUpdateInfo         "https://github.com/tomjiu/kokoa-browser"
     !define HelpLink              "https://github.com/tomjiu/kokoa-browser"
   【其余的 define 原样保留】—— 尤其 URLStubDownloadX86/AMD64/AArch64 那几个
   下载地址，改了会让安装器的下载功能失效。

3. 重新构建，验证：
     kokoa.exe 的 CompanyName      应变成 Kokoa
     kokoa.installer.exe 的 ProductName 应变成 Kokoa Browser
```

## 还没确认的（**下次构建时要留意**）

```
❓ 构建实际用的是 official / twilight / unofficial 哪一份 branding.nsi？
   证据：产物目录名是 `twilight`（dist/update/.../twilight/update.xml），
   且 surfer.json 的 brands 里有 release 与 twilight 两个。
   而 branding.nsi 有 official / unofficial 两个目录。
   【需要一次构建来确认，或读 surfer 的 ci 命令如何选 brand】

❓ surfer 的 import 是否会覆盖 branding.nsi（它可能被 surfer 自己的
   generateBranding 生成的版本顶掉）。如果被顶掉，就改用 surfer 的配置而非覆盖文件。
```

> ⚠️ **这两条未确认，不要当成结论使用。**

## 优先级

**低** —— 这两处残留不影响功能（浏览器能跑、能显示），只影响观感与合规完整度。
应该排在「space ↔ 会话绑定」（ADR-019，核心功能）之后。
# ★★ 第二批贴牌残留：产物根目录的配置文件（比第一批更严重）

> 2026-09-15。来源：直接读构建产物 `E:\temp\kbin\kokoa\` 下的 `.ini` 文件。
> **`check.sh brands` 抓不到这些** —— 它们在【产物】里，不在源码树里。

---

# 一、`application.ini`（产物根目录，**实际生效**）

文件第一行注释说「This file is not used」——**那是误导**。
`browser/application.ini` 不存在，所以**根目录这个就是生效的**。

```ini
[App]
Vendor=Mozilla                              <- 应为 Kokoa
Name=Zen                                    <- 应为 Kokoa
RemotingName=zen-twilight                   <- 应为 kokoa-twilight
CodeName=Twilight
Version=1.23t                               <- 应该是 0.1.0t（与 surfer.json 不符）
Profile=zen                                 <- profile 目录名
BuildID=20260914072753
SourceRepository=https://github.com/zen-browser/desktop   <- 指向 Zen
SourceStamp=5362ddbccd6db81162c6b239bf5edd4d7b922098      <- Zen 的 commit
ID={ec8030f7-c20a-464f-9b0e-13a3a9e97384}   <- Firefox 的 ID

[Gecko]
MinVersion=156.0
MaxVersion=156.0

[XRE]
EnableProfileMigrator=1

[AppUpdate]
URL=https://updates.zen-browser.app/updates/browser/%BUILD_TARGET%/%CHANNEL%/update.xml
```

## 逐项分析

| 键 | 当前值 | 应为 | 影响 |
|---|---|---|---|
| `Vendor` | Mozilla | Kokoa | 关于页/注册表显示 |
| `Name` | Zen | Kokoa | 应用名 |
| `RemotingName` | zen-twilight | kokoa-twilight | **进程间识别名**，可能与已有 Firefox/Zen 冲突 |
| `Version` | 1.23t | 0.1.0t | **与 `surfer.json` 的 displayVersion 不一致** |
| `Profile` | zen | kokoa | profile 目录名（`...\zen\`） |
| `SourceRepository` | github.com/zen-browser/desktop | 我们的仓库 | 关于页「源码」链接 |
| `ID` | {ec8030f7-...} | 我们的 | **Firefox 的应用 GUID** |
| `[AppUpdate] URL` | updates.zen-browser.app | 我们的或留空 | **更新检查指向 Zen** |

**注意 `Version=1.23t` 与 `surfer.json` 的 `0.1.0t` 不一致** ——
说明 `displayVersion` 与 `application.ini` 的 `Version` 是**两条独立路径**。
（`surfer ci --display-version` 只影响前者）

# 二、`updater.ini`（更新界面文案）

```ini
[Strings]
Title=Twilight Update
Info=Twilight is installing your updates and will start in a few moments…
MozillaMaintenanceDescription=The Mozilla Maintenance Service ensures that you have the latest and m…
```

**用户在更新时会看到「Twilight Update」「Twilight is installing...」** ——
这不是次要问题，是**用户可见的产品身份**。

# 三、`update-settings.ini`

```ini
[Settings]
ACCEPTED_MAR_CHANNEL_IDS=twilight
```

文件头注释说「Do not modify this file」，但那是 Firefox 的提示，
**对我们的贴牌来说，这个 channel id 应该改**（否则更新通道叫 twilight）。

**⚠️ 但这条要慎重** —— 改错了会影响更新。需要先确认我们的更新策略。

# 四、这批发现的意义

## 1. 它们比第一批更严重

```
第一批（17 处）：大多是链接、文案 —— 用户不容易注意到
第二批（本批）：application.ini / updater.ini —— 【应用身份本身】
  Vendor / Name / Profile / ID / Version / 更新 URL / 更新界面文案
```

## 2. `check.sh` 抓不到它们

**它们在【产物】里，不在源码树里。**

`check.sh brands` 扫的是 `src/ locales/ configs/ build/ prefs/ tools/`，
而 `application.ini` 是**构建期从 `moz.build` 的 `appini_defines` 生成的**，
在仓库里不存在。

**所以必须有一条「读产物」的检查。** 见下节。

## 3. 更新 URL 的那条链路终于清楚了

```
src/build/moz-build.patch
  appini_defines["MOZ_APPUPDATE_HOST"] = "updates.zen-browser.app"
        |  (构建期，除非 CONFIG 里另有值)
        v
application.ini 的 [AppUpdate] URL=https://updates.zen-browser.app/updates/...
```

而 `surfer.json` 的 `updateHostname: "updates.kokoa.local"` **走的是另一条路**
（可能是应用内 updater 的配置，不是 `application.ini`）。

**两条路径不一致，这是个真问题。**

# 五、应该加的检查：读产物

`check.sh` 应该新增一项（或在构建 workflow 里加一步）：

```
构建完成后，检查产物里的这些文件：
  application.ini   —— Vendor / Name / Profile / ID / Version / [AppUpdate] URL
  updater.ini       —— [Strings] Title / Info
  update-settings.ini —— ACCEPTED_MAR_CHANNEL_IDS
  kokoa.exe 的 PE 元数据 —— CompanyName / ProductName
  dist/*.installer.exe 的 PE 元数据

只要出现 Mozilla / Firefox / Zen / Twilight / zen-browser 就报警。
```

**这一步只能放在 CI 里做**（本地没有产物）。
但那正好 —— **它就该在构建后立刻跑，而不是等人去手动读。**

# 六、待决策（**需要产品判断，我不替产品定**）

```
1. 应用 ID（GUID）用什么？
   - 现在的 {ec8030f7-...} 是 Firefox 的
   - 换成新的会导致【现有用户的 profile / 数据路径变化】
   - 但号称是自己的产品，却用 Firefox 的 ID，也是问题

2. Profile 目录名用 kokoa 还是保持 zen？
   - 改成 kokoa 会让现有 profile 失效（用户数据「丢失」）
   - 保持 zen 则用户能看到 zen 字样

3. 更新服务器用哪个？
   - 现在指向 Zen 的 —— 用户的浏览器会去 Zen 的服务器检查更新
   - 应该是我们自己的，或者暂时关闭更新检查
```

**这三条都不是纯技术问题，需要产品决策。**
我的建议：**在决定之前，至少要把更新 URL 与更新界面文案改掉**
（因为那会让用户看到 Zen 的名字，且指向别人的服务器）。

# ✅ 构建 34943047651 成功 —— `Profile=kokoa` 验证通过

> 2026-09-15。**本次构建验证了两件事，都成功。**

---

# 一、构建结果

```
结论：success
耗时：07:42:13 → 10:27:26（约 2h45m）
产物：kokoa-win64-build（498.3 MB 下载后）
步骤：全部 ✓，含【Build】【Package】【★ 产物贴牌检查】
```

**注意**：这是第一次跑到我加的【产物贴牌检查】那一步（之前的构建用旧 workflow）。
它输出的内容在 CI 日志 L93280-93320，是本次验证的主要依据之一。

# 二、★ 核心验证：`Profile` 从 zen 变成 kokoa

## 产物 application.ini（实测，两种方法）

```
[App]
Vendor=Mozilla                       <- 预期（被 imply_option 锁死，见下）
Name=Kokoa                           ✅
RemotingName=kokoa-twilight          ✅
CodeName=Kokoa Twilight              ✅
Version=0.1.0t                       ✅
Profile=kokoa                        ★★★ 之前是 zen
BuildID=20260915075350
SourceRepository=https://github.com/tomjiu/kokoa-browser   ✅
SourceStamp=b2fa9bbfda36119257594bd5537a28a2de9519d7      ✅
ID={ec8030f7-c20a-464f-9b0e-13a3a9e97384}                  <- 预期（同被 imply）
```

## 两种独立方法验证（因为我误读过产物两次）

```
方法 1：zipfile 解析中央目录        -> Profile=kokoa
方法 2：原始字节解析本地文件头      -> Profile=kokoa
```

**结论可靠。**

# 三、这验证了什么（我之前的推断对了）

## 两条字段的性质【不同】

| 字段 | 是否被 imply_option | env 是否有效 | 本次结果 |
|---|---|---|---|
| `MOZ_APP_VENDOR` | **是**（`browser/moz.configure:14`） | ❌ 报错 | 没加（对） |
| `MOZ_APP_PROFILE` | **否** | ✅ **有效** | **成功** |

## 完整因果链（已实测）

```
上一次构建（34941719772）加了 MOZ_APP_VENDOR 的 env
  -> Build 步失败：
     "MOZ_APP_VENDOR can not be set by environment."
     "Values are accepted from: implied"
  -> 原因：browser/moz.configure L14: imply_option("MOZ_APP_VENDOR", "Mozilla")
     它把该选项的来源限定为 implied

本次只加 MOZ_APP_PROFILE（它没被 imply）
  -> Build 通过 ✓
  -> 产物 Profile=kokoa ✓
```

# 四、更新界面文案（也验证了）

```
updater.ini:
  Title=Kokoa Twilight Update                      ✅
  Info=Kokoa Twilight is installing your updates…  ✅

（之前是 "Twilight Update" / "Twilight is installing…"）
```

# 五、kokoa.exe 的 PE 元数据（产物检查输出）

```
kokoa.exe:
  Firefox                                    <- MPL 许可证文本，正常
  Firefox and Mozilla Developers; available under the MPL 2 license.
  Firefox is a Trademark of The Mozilla Foundation.
  Kokoa Twilight                             ✅
  Kokoa Twilight Launcher                    ✅
  Mozilla Corporation                        <- CompanyName，仍是 Mozilla
  MozillaFirefox_pcsmm0jrprpb2               <- 注册表键
  SOFTWARE\Mozilla\Kokoa\Launcher           ✅
```

# 六、仍未改的（**已知，且有充分理由**）

| 字段 | 现状 | 为什么不改 |
|---|---|---|
| `Vendor` | `Mozilla` | `browser/moz.configure:14` 的 imply_option 锁死；<br>**Zen 官方也没改** |
| `ID` | Firefox GUID | 同被 imply；<br>影响 profile 位置/组件注册（ZenComponents.manifest）/崩溃报告/扩展兼容；<br>**Zen 官方也没改** |
| exe `CompanyName` | `Mozilla Corporation` | 来自 Firefox 的 Windows 版本资源（.rc）；<br>要改需要 patch 那部分 |
| macOS 签名标识 | Zen 的 Team ID | 需要我们自己的 Apple 开发者账号 |

**这四项都不是「没做」，而是「决定不做」或「没有条件做」。**

# 七、下一步可选的

```
1. Vendor / exe CompanyName：如果要改，需要 patch browser/moz.configure L14
   与 Firefox 的 .rc 版本资源。收益低（只在 about:support 可见），成本中等。

2. 下一次构建会包含 skipRoute 修复（dcaa6eb，本次不在）

3. 等代理 B（TASK-11）的结果 —— 特别是它对 imply_option 优先级的独立验证
```

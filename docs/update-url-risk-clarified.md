# 澄清：更新 URL 的风险比估计的低（实测）

> 2026-09-15。修正我此前对 `updates.zen-browser.app` 的风险评估。

---

# 一、我此前的判断（**偏严重了**）

我说过：

```
[AppUpdate] URL=https://updates.zen-browser.app/...  <- 更新检查指向 Zen
这条要慎重 —— 改错了会导致更新功能失效
```

**实测发现：我们的构建【已经完全禁用了更新】。**

# 二、证据

`build/AppDir/distribution/policies.json`（**我们自己的文件**）：

```json
{
  "policies": {
    "DisableAppUpdate": true,
    "AppAutoUpdate": false,
    "ManualAppUpdateOnly": true,
    "BackgroundAppUpdate": false
  }
}
```

这是 Firefox 的**企业策略**（`distribution/policies.json`），
`DisableAppUpdate: true` 会让浏览器**根本不发起更新检查**。

**所以 `application.ini` 里的那个 URL 永远不会被使用。**

# 三、风险重新定级

| 项 | 我原来的定级 | 实际 |
|---|---|---|
| `[AppUpdate] URL` 指向 Zen | **高**（更新会去 Zen 服务器） | **低**（更新已禁用，只是文本残留） |

**它仍然应该改**（因为用户在 `about:support` 或配置文件里能看到它），
但**不是紧急的、不会造成功能问题**。

# 四、顺带查清的：为什么 MOZ_APP_VENDOR 的 default 不生效

## 模板对不上

Firefox 的 `build/application.ini.in` 里：

```ini
[App]
Vendor=@MOZ_APP_VENDOR@
Name=@MOZ_APP_BASENAME@
RemotingName=@MOZ_APP_REMOTINGNAME@
CodeName=@MOZ_APP_DISPLAYNAME@
Version=@MOZ_APP_VERSION@
Profile=@MOZ_APP_PROFILE@
ID=@MOZ_APP_ID@

[AppUpdate]
URL=https://@MOZ_APPUPDATE_HOST@/update/6/%PRODUCT%/%VERSION%/...
```

**产物里的更新 URL 格式完全不同：**

```
模板:   https://HOST/update/6/%PRODUCT%/%VERSION%/...
产物:   https://updates.zen-browser.app/updates/browser/%BUILD_TARGET%/%CHANNEL%/update.xml
```

**=> 产物的 `application.ini` 不是用 Firefox 这个模板生成的。**
它来自 Zen 自己的模板，或 surfer 的模板。

## 所以

**`moz-configure.patch` 里给 `MOZ_APP_VENDOR` 加 `default` —— 对 `application.ini` 无效。**
（那个 default 可能对别的地方有效，比如崩溃报告之类的运行时读取，
  但对这个文件无效。）

**这也解释了为什么外部代理改的 `default="Kokoa"` 没让 `Vendor` 变。**

# 五、`application.ini` 各字段的来源（**已查清模板，但生成者未定**）

| 产物里的值 | 模板变量 | 我们的设置 | 实际来源 |
|---|---|---|---|
| `Vendor=Mozilla` | `@MOZ_APP_VENDOR@` | `default="Kokoa"` | **未知（不是这个 default）** |
| `Name=Zen` | `@MOZ_APP_BASENAME@` | mozconfig `MOZ_APP_BASENAME=Kokoa` | **未知** |
| `RemotingName=zen-twilight` | `@MOZ_APP_REMOTINGNAME@` | 未设 | **未知** |
| `CodeName=Twilight` | `@MOZ_APP_DISPLAYNAME@` | branding/configure.sh | 待查 |
| `Version=1.23t` | `@MOZ_APP_VERSION@` | — | **未知（与 surfer.json 的 0.1.0t 不符）** |
| `Profile=zen` | `@MOZ_APP_PROFILE@` | **我已改成 kokoa** | ✅ 下次生效 |
| `SourceRepository=...zen-browser/desktop` | `@MOZ_SOURCE_REPO@` | mozconfig 有设 | **未知** |
| `ID={ec8030f7-...}` | `@MOZ_APP_ID@` | 未设 | **未知** |
| `[AppUpdate] URL` | `@MOZ_APPUPDATE_HOST@` | patch 设了 zen 的 | **未知 + 已被 policies 禁用** |

**「未知」的都是同一个原因：`application.ini` 由 Zen/surfer 用自己的模板生成，**
我们看到的是那套流程的产物。

# 六、下一步该怎么做

**不要再靠读 Firefox 源码猜**（我已经猜错过一次）。**直接从产物迭代：**

```
1. 等下一次构建（含我改的 MOZ_APP_PROFILE=kokoa）
2. 看 application.ini 的 Profile 字段是否变成 kokoa
   -> 变了：说明我们改的 patch 对它有影响，可以继续用这个办法改其它字段
   -> 没变：说明整个 ini 由 Zen/surfer 的模板生成，要改的是【那套模板】
3. 按结果决定下一步
```

**这是「用产物验证假设」而不是「用源码推断」—— 后者我已经错过两次了。**

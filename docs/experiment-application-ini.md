# ★ 决定性实验：application.ini 的字段来源（2026-09-15）

> 用一次真实构建（34924042114，提交 8c91275）的产物做前后对比。
> **这是「用产物验证假设」而不是「读源码推断」—— 后者我已错过两次。**

---

# 一、实验设计

对比**同一个字段集**在【旧产物】与【新产物】里的值：

```
旧产物：构建 34903542186（提交 81ac1e8）—— 贴牌改动还不全
新产物：构建 34924042114（提交 8c91275）—— 含全部贴牌改动

两边都读 application.ini（在 zip 的 kokoa/application.ini）
```

# 二、结果（**8 项变了，3 项没变**）

| 字段 | 旧 | 新 | 变化 |
|---|---|---|---|
| `Vendor` | Mozilla | Mozilla | ❌ **没变** |
| `Name` | Zen | **Kokoa** | ✅ 变了 |
| `RemotingName` | zen-twilight | **kokoa-twilight** | ✅ 变了 |
| `CodeName` | Twilight | **Kokoa Twilight** | ✅ 变了 |
| `Version` | 1.23t | **0.1.0t** | ✅ 变了 |
| `Profile` | zen | zen | ❌ **没变** |
| `SourceRepository` | zen-browser/desktop | **tomjiu/kokoa-browser** | ✅ 变了 |
| `ID` | Firefox GUID | Firefox GUID | ❌ 没变 |

另外 `updater.ini` 也变好了：

```
旧: Title=Twilight Update
新: Title=Kokoa Twilight Update

旧: Info=Twilight is installing your updates...
新: Info=Kokoa Twilight is installing your updates...
```

# 三、★ 决定性结论：**project_flag 的 default 无效**

## 变了的那批 —— 都由 mozconfig 或 surfer 配置驱动

```
Name             <- mozconfig 的 MOZ_APP_BASENAME=Kokoa      ✅ 生效
RemotingName     <- 派生自 app name + brand                   ✅
CodeName         <- MOZ_APP_DISPLAYNAME（branding/configure.sh）✅
Version          <- surfer.json 的 displayVersion             ✅
SourceRepository <- mozconfig 的 MOZ_SOURCE_REPO              ✅ 生效
SourceStamp      <- mozconfig 的 MOZ_SOURCE_CHANGESET         ✅ 生效
updater.ini 文案  <- 派生自 display name                       ✅
```

## 没变的那批 —— 全是我们「改 project_flag 的 default」的那些

```
Vendor   <- moz-configure.patch 给 MOZ_APP_VENDOR 加的 default="Kokoa"  ❌ 无效
Profile  <- moz-configure.patch 给 MOZ_APP_PROFILE 加的 default="kokoa" ❌ 无效
ID       <- MOZ_APP_ID，我们没设（默认是 Firefox 的）              ❌
```

**=> 结论确凿：`moz-configure.patch` 里给 `project_flag` 加的 `default` 
对 `application.ini` 无效。**

（这与我之前从「模板格式对不上」推出的结论一致，现在有了产物证据。）

# 四、要改 Vendor / Profile / ID，该走哪条路

## 不能走的

```
❌ mozconfig 里 export MOZ_APP_VENDOR    —— mach 会直接报错（实测过）
❌ 改 project_flag 的 default            —— 实测无效（本实验）
❌ 改 branding.nsi                       —— 那是安装器的，不是 application.ini（已排除）
```

## 可能的（**待验证**）

```
a) 在 mozconfig 里用 ac_add_options 而非 export
   但 MOZ_APP_VENDOR 是 project_flag，不接受 mozconfig……
   【要查：有没有别的语法能让 project_flag 接受 mozconfig 的值】

b) 改 surfer 的模板或配置
   既然 Name/Version/SourceRepository 都是 surfer 生成的，
   那 Vendor/Profile/ID 可能也在 surfer 的模板里。
   【应该去看 surfer 的模板 —— 这是最可能的方向】

c) 直接覆盖 application.ini
   它是构建期生成到 dist/bin/ 的。
   有没有「构建后覆盖」的钩子？【待查】
```

**我倾向 (b) —— 因为已证明 surfer 管着 8 个字段中的 5 个。**

# 五、优先级重新评估

| 项 | 用户可见度 | 优先级 |
|---|---|---|
| `Vendor=Mozilla` | 关于页可能显示 | 中 |
| `Profile=zen` | profile 目录名（`%APPDATA%\zen`） | 低（新用户才看到） |
| `ID={Firefox GUID}` | 几乎不可见 | 低 |
| `[AppUpdate] URL` 指向 Zen | 已禁用更新，不会用 | 低 |

**所以「贴牌」这件事，用户可见的部分基本都修好了**（Name/CodeName/Version/更新界面文案）。
剩下的三项用户几乎看不到。

# 六、这次实验的方法论价值

```
· 我用【同一字段集的前后对比】定位了「哪类改动有效、哪类无效」
· 这比「读源码推断」可靠 —— 那已经错过两次（prefs 机制、模板来源）
· 而且这次的结果【推翻了我自己的一个假设】：
  我原以为 Profile 改了就会变，实际不会

=> 以后处理构建期生成的产物，都应该用这个办法：
   改一处 -> 构建 -> 对比产物 -> 得出结论
   而不是读源码猜「应该会生效」
```

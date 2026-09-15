# ★ TASK-09 核验 + 关键突破：贴牌该走 CI 的环境变量

> 外部代理交付 `out/TASK-09-surfer-branding-gap.md`（333 行，14:55）。
> 验收方逐条核验，并独立验证了它的核心解法。

---

# 一、★ 突破：`MOZ_APP_VENDOR` 该走 CI 的 **环境变量**

## 它给的解法

```
.github/workflows/probe-zen-cross-build.yml 的 job 级 env 加：
  env:
    MOZ_APP_VENDOR: Kokoa
    MOZ_APP_PROFILE: kokoa
```

## 我的独立验证（不是转述）

查 Firefox 源码 `python/mozbuild/mozbuild/configure/options.py` L425-439：

```python
def get_value(self, option=None, origin="unknown"):
    if self.possible_origins and origin not in self.possible_origins:
        raise InvalidOptionError(
            "%s can not be set by %s. Values are accepted from: %s"
            % (option, origin, ", ".join(self.possible_origins))
        )
```

以及 `configure/__init__.py` L691：

```python
if value.origin not in ("default", "environment"):
```

**→ `environment` 是被接受的来源。**

## 这解释了之前所有的困惑

| 尝试 | 结果 | 为什么 |
|---|---|---|
| `mozconfig` 里 `export MOZ_APP_VENDOR` | ❌ mach 报错 | origin 是 `mozconfig`，不在 allowed 列表 |
| `moz-configure.patch` 加 `default` | ❌ 无效 | 有【环境变量】覆盖了 default |
| **CI workflow 的 `env:`** | ✅ **应该生效** | origin 是 `environment`，在 allowed 列表 |

**所以 `MOZ_APP_VENDOR` 与 `MOZ_APP_PROFILE` 的正确改法是 CI 的 `env:`。**

# 二、A1「安装器 ProductName=Firefox」是假警报（我的诊断错了）

## 它的发现

```
| 文件 | 大小 | OriginalFilename | ProductName | CompanyName |
|---|---|---|---|---|
| kokoa-0.1.0t.en-US.win64.installer.exe | 113,597,460 | 7zS.sfx.exe | Firefox | Mozilla |
| kokoa.installer.exe | 113,597,460 | 7zS.sfx.exe | Firefox | Mozilla |
| kokoa-...installer-stub.exe | 400,864 | 7zS.sfx.exe | Firefox | Mozilla |
| kokoa.installer.pretty.exe | 400,864 | 7zS.sfx.exe | Firefox | Mozilla |

FileVersion 全是 18.05
```

**`7zS.sfx.exe` 是 7-Zip 的自解压存根。** Firefox/Zen 的 Windows 安装器是
「NSIS stub + 7z 压缩包」拼接的结构 —— 读 PE 元数据读到的是**存根的**，不是 NSIS 脚本的。

**`FileVersion 18.05` 与 7-Zip 18.05 版本号一致**，进一步佐证。

**→ 我说「patch 已应用但产物仍是 Firefox」这个判断是错的。**
**patch 很可能正常生效了，不需要修。**

# 三、A5 `ID` —— 它建议不要改，我同意

```
根因：MOZ_APP_ID 是 project_flag，surfer 的 appId 字段不映射到它
      （只映射 MOZ_DISTRIBUTION_ID）

【它认为】不要改，理由：
  · 影响 profile 位置、组件注册（ZenComponents.manifest L11/L14 引用了这个 GUID）
  · 影响崩溃报告、扩展兼容
  · 改了会导致已有 profile 找不到、组件 category 匹配失败
  · 【Zen 自己也没改它】
```

**我同意。** 这是「上游也不改的东西」——跟它保持一致比自己发明安全。

# 四、其余修法（具体到行号）

| 字段 | 根因 | 改哪 | 改成什么 |
|---|---|---|---|
| `[AppUpdate] URL` | `moz-build.patch` L10 硬编码 fallback | `src/build/moz-build.patch` | `updates.kokoa.local` |
| `Vendor` / exe `CompanyName` | surfer 不设 `MOZ_APP_VENDOR` | CI workflow `env:` | `MOZ_APP_VENDOR: Kokoa` |
| `Profile` | 同上（有 env 覆盖 default） | CI workflow `env:` | `MOZ_APP_PROFILE: kokoa` |
| `ID` | surfer 的 appId 不映射 | **不改** | — |
| 3 个 `zen-browser.app` URL | 硬编码在 surfer 源码 `branding-patch.ts` L313-315 | fork surfer 或 post-import 重写 | 我们的 |

# 五、它自己列的「没查清的」（诚实，值得肯定）

```
1. 是谁在环境里设了 MOZ_APP_VENDOR=Mozilla / MOZ_APP_PROFILE=zen
   （产物证明有东西覆盖了 patch default；但本仓库里搜不到）
2. CONFIG["MOZ_APPUPDATE_HOST"] 为空的确切原因
3. NSIS 安装器的宏是否真的拿到正确值
   （PE 元数据是 7z SFX 的，无法从产物直接验证）
4. exe 的 PE 版本资源具体读哪个宏
5. surfer.json 的 vendor 在其它 surfer 版本里是否映射到 MOZ_APP_VENDOR
```

**第 1 条最关键** —— 它暗示可能有 `MOZ_APP_VENDOR=Mozilla` 在环境里。
**这条可以验证**：下次构建时在 configure 前 `env | grep MOZ_`。

# 六、TASK-09 的质量评价

```
好：
  · 它【推翻了我的错误诊断】（A1 假警报），没有顺着我的话说
  · 它给了【具体到行号的修法】
  · 它明确标注了【我认为】与【我验证了】
  · 它诚实列出 5 条没查清的，包括「谁设了环境变量」

可改进：
  · 「patch 很可能正常生效了」是【我认为】，没有实际验证 NSIS 内部
    要证明得解包 installer（7z x）看里面
```

# 七、下一步（可立即执行）

```
1. 改 CI workflow，加 job 级 env：
     MOZ_APP_VENDOR: Kokoa
     MOZ_APP_PROFILE: kokoa
   【核心解法，我已验证机制成立】

2. 改 src/build/moz-build.patch L10：
     updates.zen-browser.app -> updates.kokoa.local

3. 在 configure 前加诊断（验证「谁设了环境变量」）：
     env | grep -i '^MOZ_' | sort
   这能一次性回答它「没查清」的第 1 条

4. 重跑构建，看 Vendor / Profile / exe CompanyName 是否变了
```

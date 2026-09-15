# 未解决：`Vendor` / `Profile` 的三次尝试全部失败

> 2026-09-15。**诚实记录一个我没解决的问题。**

---

# 一、目标

```
让产物 application.ini 的两个字段变成 Kokoa：
  Vendor=Mozilla  -> Kokoa
  Profile=zen     -> kokoa

这两个来自 toolkit/moz.configure 里的 project_flag：
  project_flag(env="MOZ_APP_VENDOR", nargs=1, help="...")
  project_flag("MOZ_APP_PROFILE", nargs=1, help="...")
```

# 二、三次尝试，全部失败（都实测过）

| # | 方式 | 结果 |
|---|---|---|
| 1 | `mozconfig` 里 `export MOZ_APP_VENDOR=Kokoa` | ❌ `InvalidOptionError: can not be set by mozconfig`<br>`Values are accepted from: implied, environment, ...` |
| 2 | `moz-configure.patch` 给 project_flag 加 `default="kokoa"` | ❌ **构建成功，但产物 Profile 仍是 zen**（default 无效） |
| 3 | CI workflow 的 job `env: MOZ_APP_VENDOR: Kokoa` | ❌ `InvalidOptionError: can not be set by environment`<br>**`Values are accepted from: implied`** |

**第 3 次最关键**：报错里**唯一允许的来源是 `implied`** —— 所以 `environment` 也不行。

# 三、我犯的错（**必须记下来**）

## 错误 1：我曲解了源码，还把它当成「独立验证」

TASK-09 说「用 CI env 设 project_flag」，我引用这段作为支持的证据：

```python
# python/mozbuild/mozbuild/configure/__init__.py L691
if value.origin not in ("default", "environment"):
```

**但我读错了上下文。** 完整代码（L683-698）：

```python
when = self._conditions.get(option)
# If `when` resolves to a false-ish value, we always return None.
# ...If the option was passed explicitly, we throw an error that
# the option is not available. Except when the option was passed
# from the environment, because that would be too cumbersome.
if when and not self._value_for(when) and value is not None:
    if value.origin not in ("default", "environment"):
        raise InvalidOptionError("%s is not available in this configuration")
```

**那是「`when=` 条件不满足时的可用性检查」，与 `possible_origins` 无关。**

我把一个**错误的语境**当成了「environment 是被接受的来源」的证据，
**并且用它「独立验证」了 TASK-09 的结论 —— 实际上我们一起错了。**

## 错误 2：我没有先做最小的验证

我本可以用一个**很便宜的方式**先验证：在 CI 里加一步 `echo $MOZ_APP_VENDOR` + 一次快速 configure。
但我直接改了 workflow 并跑了**完整构建** —— 那要 3 小时（这次 12 分钟就失败，算幸运）。

# 四、现在的结论

```
· 只能通过 imply_option 设置（报错里唯一允许的来源）
· 但 imply_option 接受的是【选项名】(如 --enable-xxx)，不是变量名 MOZ_APP_VENDOR
· 而 Zen 自己也没设 MOZ_APP_VENDOR（查过它的 mozconfig，没有）
· 【所以我此前的假设「Zen 能设 Vendor」是未经证实的】
```

# 五、下一步该怎么做（**给接手的人**）

```
1. 【先验证前提】找一个 Zen 官方产物，看它的 application.ini 的 Vendor 是什么。
   如果 Zen 也是 Mozilla —— 那这个字段【上游就不改】，我们也别改。
   如果 Zen 是 "Zen OSS Team" —— 那有我们没找到的机制，值得继续挖。

2. 如果确认要改：找 Firefox 里给这些 project_flag 设 possible_origins 的地方，
   看它期望的来源是什么（可能是 imply_option + 一个 --with-vendor 选项）。

3. 【不要】再用上面三种方式 —— 都试过了。
```

# 六、我的判断（**标为我认为**）

```
【我认为】这几个字段的收益 / 成本比很低：
  · Vendor 只在 about:support 或配置文件里可见
  · Profile 只影响 profile 目录名（新用户才看得到）
  · 而改它们的成本已经证明很高（3 次失败，其中 2 次浪费了构建）

【我认为】应该：
  · 暂停这两个字段
  · 把精力放在【用户真正看得到】的地方：
      - 关于页（已改：4 个 Zen 链接 -> 我们的）
      - 主题市场链接（已改）
      - 更新界面文案（已改：Twilight Update -> Kokoa Twilight Update）
      - 应用名 / CodeName / Version（已改）
  · 这些【已经修好了】，用户看到的是 Kokoa
```

# 七、我在这件事上的教训汇总

| 次数 | 错误 |
|---|---|
| 1 | 以为 `MOZ_APP_VENDOR` 的 default 管 Vendor（实测无效） |
| 2 | 以为 `application.ini` 来自 Firefox 模板（URL 格式对不上） |
| 3 | 以为 `tools/ffprefs` 不处理 `prefs/*.yaml`（只读了文件头） |
| 4 | **曲解 `__init__.py` L691 的语境，用它「验证」了 TASK-09**（本次） |
| 5 | 说「l10n-central 覆盖了我们的文案」（解析脚本 bug，误读产物） |

**共同点：我倾向于「读一点代码/日志就下结论」，而且不交叉验证。**

**而这次最严重**：我不只自己错，还用「独立验证」的名义**给 TASK-09 的错误结论背了书**。
如果我没有引用它、而是直接说「按源码看 environment 应该可以」，
那至少是个诚实的推断；但我把它包装成了「我验证过了」。

> **教训：说「我验证了」之前，要确认自己真的理解那段代码的语境。**

# 构建 35047911545 核对结果（2026-09-16）

**状态**：success（2 小时 10 分）
**headSha**：`81c0445`（= docs/artifact-verification）

---

# 一、核对前先确认（这次没犯上次的错）

```
1fa8bc5  删欢迎页大标题   ✅ 在
04f1189  hideLogo         ✅ 在
59fc304  dsh 正则修复      ✅ 在
57c9941  AiPanel 测试      ✅ 在
0487ff1  菜单功能          ❌ 不在（10:40 提交，构建 10:25 触发，晚 15 分钟）
```

**所以菜单功能要等下一次构建（35056127083，已触发，已确认包含）。**

---

# 二、核对结果

| 项 | 结果 | 证据 |
|---|---|---|
| 4 个模块进包 | ✅ | `modules/zen/Kokoa*.mjs`（4 个） |
| 欢迎页大标题已删 | ✅ | `zen-welcome-title-line1` 引用【已删】+ 含我的注释 |
| 新标签页 hideLogo | ✅ | 默认值 = **true** |
| dsh 正则修复 | ✅ | 含 `RE_DSH_URL_END` |
| 菜单功能 | ⏳ | 不在本次构建，等 35056127083 |

---

# 三、★ 这次多做的一步：对【产物里的模块】跑单测

以前只核对「模块在不在」。这次把模块从 `omni.ja` 里**抽出来**，
**对着产物跑我们的行为测试** —— 验证打包没改变行为。

```
从 omni.ja 抽出 4 个 Kokoa*.mjs，跑：
  KokoaAiPanel.behavior           35 通过 / 0 失败
  KokoaAiPanel（纯函数）           16 通过 / 0 失败
  KokoaDshSidecar（纯函数）         9 通过 / 0 失败
  KokoaDshSidecar.behavior        20 通过 / 0 失败
  KokoaWorkspaceSessions.behavior  24 通过 / 0 失败
                                 ─────
                                 104 通过 / 0 失败
```

**意义**：这是「模块能被真的 import + 行为正确」的强证据 ——
以前这条只能靠实机测，现在构建产物一出来就能验证。

**做法（可复用）**：
```python
# 1. 从 omni.ja 抽出模块
for n in zf.namelist():
    if "modules/zen/Kokoa" in n and n.endswith(".mjs"):
        open(dst + base, "wb").write(zf.read(n))
# 2. 把 *.test.js 复制过去
# 3. node <test>.js
```

---

# 四、下一步

1. 等构建 35056127083（验证菜单功能）
2. 产物出来后照 `docs/manual-test-checklist.md` 实机点一遍
   （AI 工作区能否打开、分屏、设置页、菜单隐藏）

# 构建 35056127083 核对结果（2026-09-16，云端接手后完成）

**状态**：success（1 小时 44 分，04:34:28 → 06:19:01 UTC）
**headSha**：`de4a478`（= docs: 写测试时我踩过的坑）
**执行方**：云端 AI（本机关机后按 HANDOFF.md 接手）

---

# 一、核对前先确认（没犯「拿旧产物找新代码」的错）

```bash
sha=de4a4789e8bdfb6595e6682a45974c50c76fc71d   # gh api .../runs/35056127083 --jq .head_sha
git merge-base --is-ancestor <commit> $sha
```

```
0487ff1  菜单功能（本次构建的主角） ✅ 在
1fa8bc5  删欢迎页大标题             ✅ 在
04f1189  hideLogo                  ✅ 在
59fc304  dsh 正则修复               ✅ 在
```

四个待验改动全部在这次构建里 —— 下面的核对结果有效。

# 二、核对结果：check-artifact.py 17/17 全绿

```
模块进包 5 个   KokoaAiPanel / KokoaAiSplit / KokoaDshSidecar /
               KokoaWorkspaceSessions / KokoaMenubar   全部在 modules/zen/
pref 5 个      kokoa.menu.new-tab.visible     = true
               kokoa.menu.new-window.visible  = true
               kokoa.menu.print.visible       = false   <- 默认隐藏 ✅
               kokoa.menu.fxa.visible         = false   <- 默认隐藏 ✅
               kokoa.menu.save-file.visible   = false   <- 默认隐藏 ✅
品牌 5 项      -brand-shorter/short/full/product-name、-vendor-short-name
               全部 = Kokoa*
欢迎页大标题   zen-welcome-title-line1 引用已删 ✅
hideLogo       ActivityStream.sys.mjs 默认值 = true ✅
```

**上轮（35047911545）留下的两个「下次构建验证」项（欢迎页、hideLogo）本次确认；
上轮缺席的菜单功能（0487ff1）本次确认。** 主线代码层验证到此闭环。

# 三、对【产物里的模块】跑单测：148/148 全过

```
KokoaAiPanel.behavior            35 用例
KokoaAiPanel（纯函数）            16 用例
KokoaDshFinder.behavior          14 用例
KokoaDshSidecar.behavior         20 用例
KokoaDshSidecar（纯函数）          9 用例
KokoaMenuConsistency              5 用例
KokoaMenubar.behavior            15 用例
KokoaMenubar（纯函数）            10 用例
KokoaWorkspaceSessions.behavior  24 用例
                                ─────
                                148 通过 / 0 失败
```

比上轮多验了 **KokoaMenubar（25 用例）和 KokoaDshFinder（14 用例）** ——
打包没有改变新模块的行为。

# 四、CI 侧的交叉证据

workflow `probe-zen-cross-build` 30 步全 success，其中：

```
24 Build                              success（主编译，交叉编译 Windows）
27 Package                            success
28 ★ 产物贴牌检查（读产物，不是读源码树） success   <- 与本地质检互相独立
29 上传产物                            success
```

# 五、一个新坑：API 下载的产物是【双层 zip】

```
gh run download  -> 解包成 dist/kokoa-*.win64.zip 等平铺文件
                    check-artifact.py / extract-omnija.py 扫一层就命中 ✅
REST API /artifacts/<id>/zip -> 得到再包一层的 zip
                    脚本扫不到 omni.ja，报「找不到 omni.ja」
```

**规则**：API 下载后先解开外层 zip 再跑脚本（本地下到 `builds/<id>/` 即可）。
`builds/` 已加入 .gitignore，产物目录不会再误入提交。

# 六、下一步（只剩一件事人能做）

照 `docs/manual-test-checklist.md` 实机点一遍：

```
· 点「AI 工作区」 -> dsh 起来 -> 面板打开（带 token）
· 再点一次 -> 复用标签
· 点「与网页并排」 -> 左右分屏
· 设置 -> Kokoa -> 菜单勾选能改；三条杠菜单默认无 打印/登录/保存页面
· Ctrl+P 仍能打印（隐藏的是入口，不是能力）
· 关于对话框 = Kokoa Browser；欢迎页无大标题；新标签页无 Zen logo
```

实机通过 -> AI 工作区这条主线「初步完成」。

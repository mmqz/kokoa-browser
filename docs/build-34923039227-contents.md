# 本次构建包含的全部改动（run 34923039227）

**提交 `8fcdfd7`，一次构建验证全部。**

## 改动清单（5 处 + 2 个 CI 步骤）

| 文件 | 改了什么 | 引入于 |
|---|---|---|
| `configs/common/mozconfig` | `export MOZ_APP_VENDOR=Kokoa` | `57d6c6c` |
| `src/toolkit/moz-configure.patch` | `default="Zen Team"` -> Kokoa | `57d6c6c` |
| `src/browser/installer/windows/nsis/defines-nsi-in.patch` | 4 个 define 改 Kokoa | `8fcdfd7`（我修的） |
| `src/browser/branding/twilight/branding.nsi` | **新建**（覆盖 surfer 生成版） | `6c22cd7` |
| `src/browser/branding/official/branding.nsi` | **新建** | `6c22cd7` |
| `src/zen/common/zen-sets.js` | AI 按钮三级回退拿 URL | `f557b52` |
| `.github/workflows/probe-zen-cross-build.yml` | 加回 language packs 步骤 | `b306c41` |

## 这次构建能验证什么

```
1. language packs 步骤能否跑通（它会 git clone 整个 firefox-l10n，可能慢）
2. 产物里 zen-*.ftl 是否回来（目标：对比官方 Zen 的 13393 条目）
3. 贴牌是否修好：
     kokoa.exe 的 CompanyName      应为 Kokoa（原 Mozilla Corporation）
     kokoa.installer.exe 的 ProductName 应为 Kokoa（原 Firefox）
4. AI 按钮的 URL 来源（新加了 console.info，可以从控制台看）
5. 构建时间与磁盘是否仍在预算内（6 小时上限）
```

## ★ 我的一个疏忽（记录在案）

**外部代理的贴牌改动是被我用 `git add -A` 连带提交的，而提交标题写的是 docs。**

```
57d6c6c docs: 【里程碑】构建成功进入界面 + 三个问题定位
        ^^^ 标题是 docs，但实际也提交了 mozconfig 与 moz-configure.patch

6c22cd7 docs: 修复清单与教训汇总
        ^^^ 标题是 docs，但实际也提交了两个 branding.nsi（外部代理新建的）
```

**问题**：`git add -A` 会把工作区里【别人正在写的东西】一起收进去，
而提交标题只描述了我自己做的事。**后来看历史的人会被误导。**

**我自己的规则本来是**：只 add 我改的文件（前面几次提交确实这么做了，
比如 `687857b` 只提交我的 6 份文档）。**这次违反了。**

**影响**：不影响功能（文件都在、构建会验证），但影响可追溯性。
**补救**：本条记录 + 后续严格按路径 add。

> 同类风险：如果外部代理当时正在写一个【半成品】文件，`git add -A` 会把它提交进去。
> 这次侥幸文件是完整的。**下次不侥幸。**

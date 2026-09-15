# 构建结果（2026-09-15）

## ★ 第四轮：成功，产出可下载构建

**run 34903542186**（https://github.com/tomjiu/kokoa-browser/actions/runs/34903542186）

| | |
|---|---|
| 结论 | **success** |
| 耗时 | **2h42m35s**（22:19:40 → 01:02:15 UTC） |
| 步骤 | **25 步全部 success**，含 Package 与 上传产物 |
| 产物 | **kokoa-win64-build，468.7 MB** |
| 容器 | ubuntu-latest（免费 4 vCPU）—— **本机全程零参与** |

### 这一步证明了什么

```
✅ 我们自己的仓库能被构建（checkout 的是 tomjiu/kokoa-browser，不是上游）
✅ 贴牌生效（surfer.json / configs/common/mozconfig 都改了）
✅ 第一个自有 UI（AI 工作区工具栏按钮）能被编译进去
✅ Linux→Windows 交叉编译链在我们自己的 workflow 里可复现
✅ 打包（npm run package）能跑通
✅ 6 小时作业上限内完成，磁盘从未成为瓶颈
```

### 磁盘实测（每一阶段都有证据）

| 阶段 | 已用 | 可用 |
|---|---|---|
| 起点 | 59G | 87G |
| free-disk-space 后 | 32G | **113G** |
| 源码下载后 | 41G | 105G |
| 交叉工具链后（Wine + VS） | 49G | **96G** |

> GitHub 官方文档说标准 runner 是 14 GB SSD，**与实际不符** —— 实测是 145 GB 的盘。
> 装完全部依赖仍剩 96 GB，而 Firefox 构建只需 40 GB。**磁盘从头到尾都不是问题。**

## 三轮失败（每一轮的失败都有价值）

| 轮次 | 耗时 | 失败点 | 根因 |
|---|---|---|---|
| 1 | 7m25s | Bootstrap | 标准 runner 没有 git 身份 → surfer download 在 engine/ 里的提交失败 → 零提交仓库 → mach 读 git log -1 崩 |
| 2 | 6m18s | Import | git 身份配在了 Import 步，**比 download 晚** —— download 自己就会提交 |
| 3 | 2h53m | （成功但无产物） | 只跑了 build 没跑 package；且产物清点 find -maxdepth 3 太浅（真产物在 obj-*/dist/bin/，深度 5） |

**第 3 轮的关键教训**：find 太浅**不等于没编出东西**。
当时的清点输出是空的，差点被误判为「构建失败」—— 实际是查错了地方。
**「没找到」与「不存在」必须分清。**

## 现在的状态

```
分支仓库    https://github.com/tomjiu/kokoa-browser （公开，27 MB）
上游        zen-browser/desktop @4980f3c（Release 正是 Firefox 155.0.1）
我们的 delta  15 个文件（贴牌 4 + 自有 UI 6 + 工程/文档 5）
可下载产物    kokoa-win64-build，468.7 MB，保留 7 天
```

## 还没做的验证（**重要，别把上面当成全部完成**）

1. **产物里到底有什么** —— 已下载，待逐项清点（是不是有个能双击启动的 exe）
2. **跑起来能不能用** —— 没在任何 Windows 机器上启动过
3. **AI 工作区按钮是否真的出现** —— 需要普通截图（headless 截不到浏览器 chrome）
4. **点击后是否真的打开 dsh** —— 未验证

> 换句话说：**「能编出来」已经证实；「能跑、能用」还没证实。**
---

# 产物已下载并清点（2026-09-15 09:2x）

已把 artifact 下到 `E:\temp\kokoa-artifact\`（471.7 MB），逐项核实。

## 产物清单

| 文件 | 大小 | 是什么 |
|---|---|---|
| `dist\kokoa-0.1.0t.en-US.win64.installer.exe` | 101.5 MB | **安装器** |
| `dist\kokoa-0.1.0t.en-US.win64.zip` | 151.0 MB | **免安装压缩包** |
| `dist\output.mar` | 109.6 MB | 更新包 |
| `engine\obj-x86_64-pc-windows-msvc\dist\bin\kokoa.exe` | 1.2 MB | **可执行文件** |
| `dist\kokoa.installer.pretty.exe` | 0.4 MB | 安装器 stub |
| `dist\jsshell-win64.zip` | 2.0 MB | JS shell（附带） |

**文件名里的 `kokoa-0.1.0t.en-US.win64` 说明品牌、版本、语言、平台都正确。**

## `kokoa.exe` 的身份（读 PE 版本资源，决定任务管理器里显示什么）

```
FileDescription  : Kokoa Twilight      ✅ 贴牌生效
ProductName      : Kokoa Twilight      ✅
ProductVersion   : 0.1.0t              ✅
OriginalFilename : kokoa.exe           ✅ 可执行文件名已改
FileVersion      : 156.0               （Firefox 版本号，合理）
CompanyName      : Mozilla Corporation ⚠️ 残留 —— 应改为 Kokoa
```

## ★ 新发现：安装器没贴牌

```
dist\kokoa.installer.exe
  ProductName : Firefox     ⚠️
  CompanyName : Mozilla     ⚠️
```

**安装器（用户实际双击的那个）显示的还是 Firefox。**
`surfer.json` 的贴牌覆盖了主程序，但**没覆盖安装器**。
上一份残留清单（`docs/kokoa-zen-residuals.md`）也没提到这一处。

> 这条是**读产物元数据**才发现的，读源码树发现不了 ——
> 说明「清点产物」这一步不是走过场。

## 更新后的未验证清单

```
✅ 产物存在且完整（安装器 / 压缩包 / 可执行文件都在）
✅ 主程序贴牌生效（Kokoa Twilight / kokoa.exe）
❌ 主程序的 CompanyName 仍是 Mozilla Corporation        <- 待修
❌ 安装器完全没贴牌（还是 Firefox / Mozilla）            <- 待修
❌ 没在任何 Windows 机器上启动过
❌ AI 工作区按钮是否真的出现（需要普通截图）
❌ 点击后是否真的打开 dsh
```

> **「能编出来」+「产物正确」已证实；「能跑、能用」还没证实。**
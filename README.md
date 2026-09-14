# kokoa-browser

Kokoa 的浏览器分支试验田。

## 这是什么

Kokoa 是一款「AI 工作区与网页同级」的桌面客户端。此前它靠**覆盖官方 Firefox 的
资源包（omni.ja）**实现，撞上了四个死结（布局对抗、观感外挂、主线程补偿定时器、
每版本回归税）。决策依据见主仓的 `docs/architecture.md` **ADR-017 / ADR-018**。

**结论：以 Zen Browser 为上游做源码级分支。** 本仓库是该分支的试验田，
做到约八成再迁回主仓，**不急于合并**。

- 主仓（私有）：https://github.com/tomjiu/kokoa
- 上游：https://github.com/zen-browser/desktop （MPL-2.0）

## 现阶段：只做构建可行性探针

本仓库当前**不含任何产品代码**，只有一个 workflow：
`.github/workflows/probe-zen-cross-build.yml`

它照抄 Zen 官方 CI 的**步骤内容**，替换掉 runner（`blacksmith-*` -> `ubuntu-latest`）
与第三方 action，并剥掉 PGO / 签名 / 打包 / LTO，只为回答三个问题：

1. **磁盘**：GitHub 标准 runner 是 14 GB SSD，而 Firefox 构建要 40 GB。
   加上 `free-disk-space` 腾出的约 30 GB，够不够？
2. **时间**：4 vCPU（Zen 的 CI 用 8 vCPU）能否在 GitHub 的 **6 小时**作业上限内编完？
3. **可复现性**：Zen 的 Linux→Windows 交叉编译链能否在我们自己的 workflow 里跑通？

> 注意：Zen 的 Windows 发布产物**本身就是交叉编译出来的**
> （其 CI 里 `ZEN_CROSS_COMPILING=1`，并把 Wine 与 VS 工具链下载到 Linux）。
> 所以这条路是**被验证过的**；我们只是换了 runner 规格与算力。

## 失败也是结果

如果它跑不通，那说明我们必须走本地构建，或必须购买更大的 runner。
**两种结论都有价值，报清楚比跑通更重要。**

## 许可

本项目基于 Zen Browser 与 Firefox，二者均为 **MPL-2.0**。
我们修改过的 MPL 文件以同许可提供。

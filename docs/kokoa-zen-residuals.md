# 任务 2 · Zen 品牌残留清单

> 基线：`tomjiu/kokoa-browser` main @ `5f1b419`（Zen dev @ `4980f3c`）
> 搜索范围：全树（排除 `package-lock.json`、二进制资源、`locales/**`、`src/zen/tests/**`）
> 判定三档：**必须改** / **可以留**（内部标识或上游 CI，不进用户可见产品）/ **上游署名必须留**

## 1. 已改（用户可见 / 产品身份）

| 文件 | 原文 | 改为 | 理由 |
|---|---|---|---|
| `surfer.json:2` | `"name": "Zen Browser"` | `Kokoa Browser` | 产品名 |
| `surfer.json:3` | `"vendor": "Zen OSS Team"` | `Kokoa` | 厂商 |
| `surfer.json:4` | `"appId": "zen"` | `kokoa` | 应用 ID |
| `surfer.json:5` | `"binaryName": "zen"` | `kokoa` | 可执行文件名 |
| `surfer.json:19-21` | brandShorter/Short/Full = Zen* | Kokoa* | 关于页/标题栏 |
| `surfer.json:39-41` | twilight brand = Zen Twilight | Kokoa Twilight | 探针用 brand |
| `surfer.json:25,45` | repo = zen-browser/desktop | tomjiu/kokoa-browser | 更新源 |
| `surfer.json:56` | updates.zen-browser.app | updates.kokoa.local | 更新主机（占位） |
| `configs/common/mozconfig:7` | `--with-app-basename=Zen` | `Kokoa` | 二进制 basename |
| `configs/common/mozconfig:12` | `MOZ_APP_BASENAME=Zen` | `Kokoa` | 同上 |
| `configs/common/mozconfig:16` | `app.zen-browser` | `app.kokoa` | distribution-id |
| `configs/common/mozconfig:23` | MOZ_SOURCE_REPO=zen-browser/desktop | tomjiu/kokoa-browser | 源码署名 |
| `build/AppDir/zen.desktop:2` | `Name=Zen Browser` | `Kokoa Browser` | Linux 桌面入口 |
| `build/AppDir/zen.desktop:4,8` | `Exec=zen` / `StartupWMClass=zen` | `kokoa` | 同上 |
| 同文件 Actions 段 Exec= | `zen ...` | `kokoa ...` | 同上 |

## 2. 必须改（尚未改 — 下一轮）

| 位置 | 现状 | 理由 |
|---|---|---|
| `configs/branding/release/`、`configs/branding/twilight/` | 仍是 Zen/Firefox 图标与 about 文案 | 用户可见品牌资产 |
| `build/AppDir/AppRun`、`build/AppDir/usr/share/icons/...` | 图标/启动脚本仍指向 zen | 打包产物 |
| `.github/workflows/build.yml` 等上游 release 流水线 | 大量 `zen-browser/*` 仓库引用 | **今晚不用跑它们**；真要做发布流水线时必须改成我们的 |
| 关于对话框 / 欢迎页文案里的「Zen」 | `src/browser/base/content/aboutDialog-*.patch` 等 | 用户可见 |

## 3. 可以留（内部标识 — 刻意不改）

| 类别 | 例子 | 理由 |
|---|---|---|
| 目录/文件名 | `src/zen/**`、`zen-*.css`、`Zen*.mjs` | 重命名是高风险大手术，不进用户可见层 |
| pref 命名空间 | `zen.view.*`、`zen.workspaces.*`、`zen.theme.*` | 存量配置与代码耦合，改了会炸迁移 |
| CSS class / id | `zen-tabs-wrapper`、`zen-site-data-icon-button` | DOM 与 JS 双向绑定 |
| chrome:// 路径 | `chrome://browser/content/zen-styles/...` | 打包清单依赖 |
| locales 文件名 | `zen-workspaces.ftl` 等 | 翻译流水线依赖；**字符串内容**里的 Zen 产品名另议 |
| 上游 CI secret 路径 | `$HOME/.zen-keys/` | 只是 CI 约定，可后续统一 |

> **原则**：贴牌目标是「用户看见的是 Kokoa」，不是「全树搜不到 zen」。
> 内部 API/命名空间留着，等 CI 真正编出我们自己的二进制之后再评估是否值得改名。

## 4. 上游署名必须留

| 位置 | 内容 |
|---|---|
| `README.md` | 明确写「基于 Zen Browser / Firefox，MPL-2.0」 |
| `LICENSE` | MPL-2.0 全文 |
| `SECURITY.md` / 各源文件 MPL header | 法律要求 |
| 关于页（待做） | 保留「Based on Zen Browser and Firefox」致谢 |
| `mozconfig` 注释 | 说明构建链来自 Zen 官方 CI |

## 5. 证据

```text
【我验证了】
- surfer.json / mozconfig / zen.desktop 的 diff 为本次编辑结果
- CI run 34847682773 的 Checkout 步骤显示 tomjiu/kokoa-browser（见 Actions 日志）

【我认为】
- 内部 zen.* 命名空间暂不改是合理取舍（改动面 >> 收益）
- branding 图标替换可以等任务 4 有了真实截图后再统一做
```

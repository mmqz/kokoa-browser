# 工作项：二级菜单可配置（默认隐藏无关项）

> 来源：用户需求。
> **这是给「后续集成 dsh 的人」看的文档** —— 他们会在菜单里加 AI 相关项，
> 也会在设置页里做专门的 AI 部分。所以这里要定义好【接口与惯例】，不只是改一次。

---

# 一、需求（用户原话的意思）

```
1. 二级菜单（点右上角三条杠弹出的 appMenu）里，
   【默认隐藏】与产品无关的项 —— 尤其：
     · 打印
     · 账户登录（点了会去登录 Firefox）
2. 菜单内容【可由设置控制】—— 而不是写死在代码里
3. 设置页里有【专门的管理界面】
4. 【后续】集成 dsh 时，会往这个菜单里加 AI 相关项，
   并在设置页里加专门的 AI 部分

=> 所以本工作项要产出的是【机制 + 惯例】，不是一次性的删除。
```

---

# 二、已查清的技术事实（**都有证据**）

## 2.1 appMenu 的每一项都有稳定 id

证据：产物 `chrome/browser/content/browser/browser.xhtml`（367 KB）

```xml
<toolbarbutton id="appMenu-print-button2"
   class="subviewbutton"
   data-l10n-id="appmenuitem-print"
   key="printKb"
   command="cmd_print"
/>
```

**共 65 个 `appMenu-*` id**（完整清单见附录 A）。

## 2.2 Zen 已有「用 pref 控制菜单」的现成范例

`src/zen/common/modules/ZenMenubar.mjs`：

```js
L5    const WINDOW_SCHEME_PREF = "zen.view.window.scheme";
L136  if (!Services.prefs.getBoolPref("zen.window-sync.enabled", true)) {
        const itemsToHide = ["appMenuRecentlyClosedWindows", "historyUndoWindowMenu"];
        for (const id of itemsToHide) {
          PanelMultiView.getViewNode(document, id).setAttribute("hidden", "true");
        }
      }
```

**这就是我们要扩展的模式** —— 它证明：
  · 可以用 `getBoolPref` 决定显示/隐藏
  · 用 `PanelMultiView.getViewNode(document, id)` 拿到菜单项
  · 用 `setAttribute("hidden", "true")` 隐藏

## 2.3 pref 命名惯例

Zen 用 `zen.<模块>.<项>`。统计（`prefs/` 下）：

```
zen.view        34 个
zen.theme       14 个
zen.workspaces  13 个
zen.tabs        13 个
...
```

**目前【没有】`kokoa.*` 命名空间** —— 我们要建立它。

## 2.4 `#initAppMenu()` 是我们挂钩子的地方

```js
#init() {
  this.#initViewMenu();      // 外观
  this.#initSpacesMenu();    // 工作区
  this.#initAppMenu();       // ★ 应用菜单（打印/账户在这里）
  this.#hideWindowRestoreMenus();   // ★ 现成的「隐藏项」范例
}
```

---

# 三、设计：pref 命名与语义

## 3.1 命名

```
kokoa.menu.<项名>.visible        (bool, 默认值见 3.2)
```

例：

```
kokoa.menu.print.visible          = false    // 打印：默认隐藏
```

## 3.2 默认值表（**这是给后续集成者看的契约**）

| 菜单项 id | pref 名 | 默认 | 理由 |
|---|---|---|---|
| `appMenu-new-ai-window-button` | `kokoa.menu.ai-window.visible` | **true** | 我们的核心 |
| `appMenu-new-tab-button2` | `kokoa.menu.new-tab.visible` | **true** | 基础 |
| `appMenu-new-window-button2` | `kokoa.menu.new-window.visible` | **true** | 基础 |
| `appMenu-new-private-window-button2` | `kokoa.menu.new-private-window.visible` | **true** | 基础 |
| `appMenu-zoom-controls` | `kokoa.menu.zoom.visible` | **true** | 基础 |
| `appMenu-quit-button2` | `kokoa.menu.quit.visible` | **true** | 基础 |
| **`appMenu-print-button2`** | `kokoa.menu.print.visible` | **false** | **用户要求默认隐藏** |
| **`appMenu-fxa-status2`** | `kokoa.menu.fxa.visible` | **false** | **用户要求默认隐藏（登录 Firefox）** |
| `appMenu-fxa-label2` | （同上，同族一起控） | false | |
| `appMenu-fxa-text` | （同上） | false | |
| `appMenu-fxa-separator` | （同上） | false | |
| `appMenu-fxa-sign-in-promo` | （同上） | false | |
| `appMenu-fxa-sign-in-promo-button` | （同上） | false | |
| `appMenu-nova-fxa-label` | （同上） | false | |
| `appMenu-passwords-button` | `kokoa.menu.passwords.visible` | **false** | 与账户同族 |
| `appMenu-help-button2` | `kokoa.menu.help.visible` | **false** | Firefox 帮助 |
| `appMenu-referrals-button` | `kokoa.menu.referrals.visible` | **false** | Firefox 推荐 |
| `appMenu-referrals-separator` | （同上） | false | |
| `appMenu-create-profile-button` | `kokoa.menu.profiles.visible` | **false** | Firefox 功能 |
| `appMenu-more-button2` | `kokoa.menu.more.visible` | **false** | 里面多是 Firefox 专属 |
| `appMenu-extensions-themes-button` | `kokoa.menu.extensions.visible` | **待定** | **「zen 模组」入口 —— 见 3.3** |
| `appMenu-translate-button` | `kokoa.menu.translate.visible` | **待定** | |
| `appMenu-bookmarks-button` | `kokoa.menu.bookmarks.visible` | **待定** | 基础功能？ |
| `appMenu-history-button` | `kokoa.menu.history.visible` | **待定** | 基础功能？ |
| `appMenu-downloads-button` | `kokoa.menu.downloads.visible` | **待定** | 基础功能？ |
| `appMenu-settings-button` | `kokoa.menu.settings.visible` | **true** | 必须留（否则进不了设置） |
| `appMenu-find-button2` | `kokoa.menu.find.visible` | **待定** | |
| `appMenu-save-file-button2` | `kokoa.menu.save-file.visible` | **待定** | |
| `appMenu-fullscreen-button2` | `kokoa.menu.fullscreen.visible` | **待定** | |
| `appMenu-chats-history-button` | `kokoa.menu.ai-history.visible` | **待定** | **可能是 AI 相关 —— 见 3.3** |
| `appMenu-tab-groups-button` | `kokoa.menu.tab-groups.visible` | **待定** | |

> **「待定」的我没擅自决定** —— 需要产品定。

## 3.3 ★ 两个需要特别注意的项

### (a) `appMenu-extensions-themes-button` ——「zen 模组」入口

```
用户报过「zen 模组」。这个菜单项指向的很可能就是 Zen 的主题商店。

【问题】Kokoa 要不要主题商店？
  · 要 -> 保留菜单项，但要改它指向的地址（现在是 zen-browser 的）
  · 不要 -> 默认隐藏

【相关文件】（产物里发现的）：
  actors/ZenModsMarketplaceChild.sys.mjs / Parent.sys.mjs
  chrome/.../zen-components/ZenMods.mjs
  chrome/.../preferences/zen-settings.js
  modules/ZenActorsManager.sys.mjs
```

### (b) `appMenu-chats-history-button` —— 可能是 AI 相关

```
名字里有 chats，可能与我们未来的 dsh 集成相关。
【建议】集成 dsh 时再决定（那时会重排这部分）。
```

## 3.4 分组 pref（简化设置界面）

```
除了每项一个 pref，再加分组开关（设置页里好用）：

  kokoa.menu.group.basic.visible   = true    // 基础（新建标签/窗口等）
  kokoa.menu.group.account.visible = false   // 账户与同步（fxa* / passwords）
  kokoa.menu.group.firefox.visible = false   // Firefox 专属（help / referrals / profiles）
  kokoa.menu.group.tools.visible   = true    // 工具（zoom / find / print...）
```

**优先级：单项 pref > 分组 pref > 默认值。**

---

# 四、实现方案

## 4.1 新增文件

```
prefs/kokoa/menu.yaml                      默认值（kokoa.menu.* 全在这）
src/zen/kokoa/KokoaMenuManager.mjs         读 pref -> 隐藏/显示菜单项
```

> `prefs/kokoa/` 是【新目录】。我们的 `prefs/` 下已有 firefox/zen/privatefox/fastfox，
> 加 kokoa/ 符合惯例（`tools/ffprefs` 会递归扫 prefs/ 下所有 yaml）。

## 4.2 改 `ZenMenubar.mjs`

在 `#init()` 里加一行（照 `#hideWindowRestoreMenus()` 的模式）：

```js
#init() {
  this.#initViewMenu();
  this.#initSpacesMenu();
  this.#initAppMenu();
  this.#hideWindowRestoreMenus();
  this.#applyKokoaMenuPrefs();     // ★ 新增
}

#applyKokoaMenuPrefs() {
  const MAP = [
    ['kokoa.menu.print.visible',        ['appMenu-print-button2']],
    ['kokoa.menu.fxa.visible',          ['appMenu-fxa-status2', 'appMenu-fxa-label2',
                                         'appMenu-fxa-text', 'appMenu-fxa-separator',
                                         'appMenu-fxa-sign-in-promo',
                                         'appMenu-fxa-sign-in-promo-button',
                                         'appMenu-nova-fxa-label']],
    // ... 其余照 3.2 的表
  ];
  for (const [pref, ids] of MAP) {
    const visible = Services.prefs.getBoolPref(pref, false);
    for (const id of ids) {
      const el = PanelMultiView.getViewNode(document, id)
              || document.getElementById(id);
      if (el) { el.setAttribute('hidden', String(!visible)); }
    }
  }
}
```

## 4.3 设置页

放在已有的 Kokoa 设置页（见 `workitem-kokoa-settings.md`）。

```
Kokoa 设置分类
  ├── 菜单          <- 本工作项：勾选框列表 + 分组开关
  └── AI            <- ★ 后续（集成 dsh 时加）
        · dsh 连接（URL / token）
        · AI 工作区偏好
        · 模型管理（CPA）
```

**设置页的菜单管理界面，应当是【由 pref 列表驱动】的**：
即遍历 `kokoa.menu.*` 自动生成勾选框 —— 这样后续加菜单项不用改 UI 代码。

---

# 五、★ 给后续集成 dsh 的人的约定

```
1. 新增 AI 相关菜单项时：
   · 放在 appMenu 的【哪个位置】要先定（建议紧跟 appMenu-new-ai-window-button）
   · 加对应的 pref：kokoa.menu.<项>.visible，默认 true
   · 在 KokoaMenuManager 的 MAP 里登记
   · 设置页的 AI 部分自动出现该项（因为是 pref 驱动）

2. 【不要】直接改 browser.xhtml 的静态顺序
   而是通过 pref + KokoaMenuManager 控制
   理由：静态改动与上游同步会冲突

3. 如果要做「顺序可调」：
   · 先读本文第六节（复杂度说明）
   · 建议用 pref 存顺序数组：kokoa.menu.order = "ai-window,new-tab,..."
   · 运行时用 insertBefore 重排
```

---

# 六、为什么「顺序可调」要慎重（**我的评估**）

```
· Firefox 的 appMenu 是【静态 XUL】，写在 browser.xhtml 里
· 调顺序 = 运行时重排 DOM
· 但 appMenu 有嵌套结构：
    appMenu-mainView     主视图
    appMenu-multiView    子视图（more / library 等）
    appMenu-libraryView  库视图
  重排时要处理【层级】，不是简单的一维列表
· 而且 Firefox 自己的代码会在运行时增删项（如更新横幅）

=> 【建议】：
   第一步只做「显示/隐藏」（本工作项）
   第二步再考虑顺序（如果确实需要）
```

---

# 七、一个必须说清的边界

```
【隐藏是 UI 层，不是功能层。】

  隐藏「打印」菜单项后：Ctrl+P / 网页的打印按钮【仍然可用】
  隐藏「账户登录」后：Firefox Sync【仍然在工作】（只是没入口）

如果要做【功能层】的禁用，需要：
  · 打印：改 key_print 的快捷键绑定 / 或 policies.json 的 PrintingEnabled
  · 账户：distribution/policies.json 的 DisableFirefoxAccounts

=> 【这两件事分开做，别混为一谈。】
   本工作项只做 UI 层。
```

---

# 附录 A：全部 65 个 appMenu-* id

（从产物 `browser.xhtml` 提取，可核验）

```
appMenu-addon-banners                        appMenu-addon-installed-notification
appMenu-bookmarks-button                     appMenu-chats-history-button
appMenu-create-profile-button                appMenu-downloads-button
appMenu-extensions-themes-button             appMenu-find-button2
appMenu-fullscreen-button2                   appMenu-fxa-label2
appMenu-fxa-separator                        appMenu-fxa-sign-in-promo
appMenu-fxa-sign-in-promo-button             appMenu-fxa-status2
appMenu-fxa-text                             appMenu-header-description
appMenu-header-title                         appMenu-help-button2
appMenu-history-button                       appMenu-library-bookmarks-button
appMenu-library-downloads-button             appMenu-library-history-button
appMenu-library-recentlyClosedTabs           appMenu-library-recentlyClosedWindows
appMenu-libraryView                          appMenu-mainView
appMenu-menu-message                         appMenu-more-button2
appMenu-multiView                            appMenu-new-ai-window-badge
appMenu-new-ai-window-button                 appMenu-new-classic-window-button
appMenu-new-private-window-button2           appMenu-new-tab-button2
appMenu-new-window-button2                   appMenu-notification-popup
appMenu-nova-fxa-label                       appMenu-passwords-button
appMenu-popup                                appMenu-print-button2
appMenu-profiles-button                      appMenu-quit-button2
appMenu-referrals-button                     appMenu-referrals-separator
appMenu-restoreSession                       appMenu-save-file-button2
appMenu-settings-button                      appMenu-tab-groups-button
appMenu-tabGroupsListView                    appMenu-theme-installed-notification
appMenu-translate-button                     appMenu-unified-extensions-button
appMenu-update-available-notification        appMenu-update-banner
appMenu-update-banner-description            appMenu-update-banner-title
appMenu-update-manual-notification           appMenu-update-other-instance-notification
appMenu-update-restart-notification          appMenu-update-unsupported-notification
appMenu-viewCache                            appMenu-zoom-controls
appMenu-zoomEnlarge-button2                  appMenu-zoomReduce-button2
appMenu-zoomReset-button2
```

（注意：`appMenu-update-*` 与 `appMenu-addon-*` 是【动态横幅】，不是常驻项，不需要 pref）

# 附录 B：如何核验本文的事实

```
1. 65 个 id：
   解包产物 browser/omni.ja -> 看 chrome/browser/content/browser/browser.xhtml
   命令（bash）：
     unzip -qq -o omni.ja -d /tmp/x
     grep -o 'id="appMenu-[a-zA-Z0-9_-]*"' /tmp/x/chrome/browser/content/browser/browser.xhtml \
       | sort -u

2. Zen 的 pref 控制菜单范例：
   src/zen/common/modules/ZenMenubar.mjs L135-147

3. 菜单项的静态定义（以打印为例）：
   browser.xhtml L5059-5064
```

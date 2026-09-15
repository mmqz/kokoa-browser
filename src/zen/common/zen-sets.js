// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

document.addEventListener(
  "MozBeforeInitialXULLayout",
  () => {
    // <commandset id="mainCommandSet"> defined in browser-sets.inc
    document
      .getElementById("zenCommandSet")
      // eslint-disable-next-line complexity
      .addEventListener("command", event => {
        switch (event.target.id) {
          case "cmd_zenCompactModeToggle":
            gZenCompactModeManager.toggle();
            break;
          case "cmd_toggleCompactModeIgnoreHover":
            gZenCompactModeManager.toggle(true);
            break;
          case "cmd_zenCompactModeShowSidebar":
            gZenCompactModeManager.toggleSidebar();
            break;
          case "cmd_zenWorkspaceForward":
            gZenWorkspaces.changeWorkspaceShortcut();
            break;
          case "cmd_zenWorkspaceBackward":
            gZenWorkspaces.changeWorkspaceShortcut(-1);
            break;
          case "cmd_zenSplitViewGrid":
            gZenViewSplitter.toggleShortcut("grid");
            break;
          case "cmd_zenSplitViewVertical":
            gZenViewSplitter.toggleShortcut("vsep");
            break;
          case "cmd_zenSplitViewHorizontal":
            gZenViewSplitter.toggleShortcut("hsep");
            break;
          case "cmd_zenSplitViewUnsplit":
            gZenViewSplitter.toggleShortcut("unsplit");
            break;
          case "cmd_zenSplitViewContextMenu":
            gZenViewSplitter.contextSplitTabs();
            break;
          case "cmd_zenCtxShareSplitView":
            gZenViewSplitter.contextShareSplitView();
            break;
          case "cmd_zenCopyCurrentURLMarkdown":
            gZenCommonActions.copyCurrentURLAsMarkdownToClipboard();
            break;
          case "cmd_zenCopyCurrentURL":
            gZenCommonActions.copyCurrentURLToClipboard();
            break;
          case "cmd_zenPinnedTabReset":
            gZenPinnedTabManager.resetPinnedTab(gBrowser.selectedTab);
            break;
          case "cmd_zenPinnedTabResetNoTab":
            gZenPinnedTabManager.resetPinnedTab();
            break;
          case "cmd_zenToggleSidebar":
            gZenVerticalTabsManager.toggleExpand();
            break;
          case "cmd_zenOpenZenThemePicker":
            gZenThemePicker.openThemePicker(event);
            break;
          case "cmd_zenChangeWorkspaceTab":
            gZenWorkspaces.changeTabWorkspace(
              event.sourceEvent.target.getAttribute("zen-workspace-id")
            );
            break;
          case "cmd_zenToggleTabsOnRight":
            gZenVerticalTabsManager.toggleTabsOnRight();
            break;
          case "cmd_zenSplitViewLinkInNewTab":
            gZenViewSplitter.splitLinkInNewTab();
            break;
          case "cmd_zenNewEmptySplit":
            setTimeout(() => {
              gZenViewSplitter.createEmptySplit();
            }, 0);
            break;
          case "cmd_zenReplacePinnedUrlWithCurrent":
            gZenPinnedTabManager.replacePinnedUrlWithCurrent();
            break;
          case "cmd_zenEditPinnedUrl":
            gZenPinnedTabManager.editPinnedUrl();
            break;
          case "cmd_contextZenAddToEssentials":
            gZenPinnedTabManager.addToEssentials();
            break;
          case "cmd_contextZenRemoveFromEssentials":
            gZenPinnedTabManager.removeEssentials();
            break;
          case "cmd_zenCtxDeleteWorkspace":
            gZenWorkspaces.contextDeleteWorkspace(event);
            break;
          case "cmd_zenCtxShareWorkspace":
            gZenWorkspaces.contextShareWorkspace();
            break;
          case "cmd_zenChangeWorkspaceName":
            gZenVerticalTabsManager.renameTabStart({
              target: gZenWorkspaces.activeWorkspaceIndicator.querySelector(
                ".zen-current-workspace-indicator-name"
              ),
            });
            break;
          case "cmd_zenChangeWorkspaceIcon":
            gZenWorkspaces.changeWorkspaceIcon();
            break;
          case "cmd_zenReorderWorkspaces":
            gZenUIManager.showToast("zen-workspaces-how-to-reorder-title", {
              timeout: 9000,
              descriptionId: "zen-workspaces-how-to-reorder-desc",
            });
            break;
          case "cmd_zenOpenWorkspaceCreation":
            gZenWorkspaces.openWorkspaceCreation(event);
            break;
          case "cmd_zenOpenFolderCreation":
            gZenFolders.createFolder([], {
              renameFolder: true,
            });
            break;
          case "cmd_zenTogglePinTab": {
            const currentTab = gZenGlanceManager.getTabOrGlanceParent(
              gBrowser.selectedTab
            );
            if (currentTab && !currentTab.hasAttribute("zen-empty-tab")) {
              if (currentTab.pinned) {
                gBrowser.unpinTab(currentTab);
              } else {
                gBrowser.pinTab(currentTab);
              }
            }
            break;
          }
          case "cmd_zenCloseUnpinnedTabs":
            gZenWorkspaces.closeAllUnpinnedTabs();
            break;
          case "cmd_zenUnloadWorkspace": {
            gZenWorkspaces.unloadWorkspace();
            break;
          }
          case "cmd_zenUnloadAllOtherWorkspace": {
            gZenWorkspaces.unloadAllOtherWorkspaces();
            break;
          }
          case "cmd_zenOpenSpaceRoutingSettings": {
            gZenSpaceRoutingManager.openSpaceRoutingDialog(window);
            break;
          }
          case "cmd_zenNewNavigatorUnsynced":
            OpenBrowserWindow({ zenSyncedWindow: false });
            break;
          case "cmd_zenNewLiveFolder": {
            const { ZenLiveFoldersManager } = ChromeUtils.importESModule(
              "resource:///modules/zen/ZenLiveFoldersManager.sys.mjs"
            );
            ZenLiveFoldersManager.handleEvent(event);
            break;
          }
          case "cmd_zenDuplicateTab": {
            const selectedTabs = gBrowser.selectedTabs;
            let insertAt = selectedTabs.at(-1).index + 1;
            for (const tab of selectedTabs) {
              gBrowser.duplicateTab(tab, true, { tabIndex: insertAt++ });
            }
            break;
          }
          case "cmd_kokoaOpenAiWorkspace": {
            // Kokoa AI 工作区：打开本地 dsh 面板。
            //
            // 【2026-09-15 重构】原来这里内联了约 100 行（三级回退拿 URL + addTab）；
            // 现在抽到 src/zen/kokoa/KokoaAiPanel.mjs，原因：
            //   · 那个模块是【移植主线旧外壳】的成果，逻辑与主线一一对应
            //   · 内联写在这里没法复用（分屏 / 侧栏 / 设置页都要用）
            //   · 也已经没法测试
            //
            // 本次重构【顺带修了一个体验问题】：
            //   原来每次都 addTab —— 点几次就开出几个重复的 AI 标签。
            //   现在先 findAiTab 复用（移植主线 boot.js L1047 的直接收益）。
            // 路径说明：src/zen/kokoa/moz.build 的 EXTRA_JS_MODULES.zen
            // 把模块注册到 resource:///modules/zen/<名字> —— Zen 的惯例。
            const { openAiTab, hasToken } = ChromeUtils.importESModule(
              "resource:///modules/zen/KokoaAiPanel.mjs"
            );

            const { tab, reused, url, source } = openAiTab(window);

            console.info(
              "[Kokoa] AI workspace " +
                (reused ? "reused" : "opened") +
                ": " + source + " -> " + url
            );

            if (reused) {
              break;
            }

            // 没有 token 时给出可操作的提示，而不是让 dsh 报一句看不懂的错
            if (!hasToken(url)) {
              console.warn(
                "[Kokoa] AI workspace URL has no token. dsh will show " +
                  "\u0027web authentication required\u0027. Set KOKOA_DSH_URL " +
                  "env var (the dsh CLI prints the full URL with token) or write " +
                  "it to <KOKOA_STATE_DIR>/gecko-shell/kokoa-panel.url"
              );
            }
            void tab;
            break;
          }
          default:
            gZenGlanceManager.handleMainCommandSet(event);
            if (event.target.id.startsWith("cmd_zenWorkspaceSwitch")) {
              const index =
                parseInt(
                  event.target.id.replace("cmd_zenWorkspaceSwitch", ""),
                  10
                ) - 1;
              gZenWorkspaces.shortcutSwitchTo(index);
            }
            break;
        }
      });
  },
  { once: true }
);

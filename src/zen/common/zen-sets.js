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
            // Kokoa first-owned UI: open the local AI workspace as a tab.
            //
            // 【2026-09-15 修】原实现硬编码 "http://127.0.0.1:3080/"，但 dsh 要求 token ——
            // 打开无 token 的地址会显示 "web authentication required; reopen the URL
            // printed by dsh web"。
            //
            // 三级回退（照抄主线 apps/gecko-shell/.../kokoa/boot.js 的 panelUrl() L154-L170）：
            //   1. 环境变量 KOKOA_DSH_URL —— 启动器注入，【带 token】
            //   2. <state>/gecko-shell/kokoa-panel.url 文件 —— 开发期
            //   3. 硬编码兜底 —— 会缺 token，所以下面会给出明确提示
            const KOKOA_DEFAULT_DSH_URL = "http://127.0.0.1:3080/";

            let url = "";
            let urlSource = "";

            // 1) 环境变量优先 —— 它带着 dsh 的 token
            try {
              url = Services.env.get("KOKOA_DSH_URL") || "";
              if (url) {
                urlSource = "env:KOKOA_DSH_URL";
              }
            } catch (e) {
              // Services.env 在某些沙箱下不可用 —— 不是致命错误，继续回退
            }

            // 2) 开发期文件：<state>/gecko-shell/kokoa-panel.url
            //    注意：这个命令处理函数【不是 async】（见 addEventListener 回调），
            //    所以不能用 await IOUtils.readUTF8 —— 用同步的 FileUtils 读。
            //    （第一版我写了 await，被 node --check 当场拦下，见 commit 说明）
            if (!url) {
              try {
                const stateDir = Services.env.get("KOKOA_STATE_DIR") || "";
                if (stateDir) {
                  const { FileUtils } = ChromeUtils.importESModule(
                    "resource://gre/modules/FileUtils.sys.mjs"
                  );
                  const file = FileUtils.getFile("ProfD", []);
                  // 用 stateDir 拼绝对路径：ProfD 只是拿一个 File 对象当模板
                  file.initWithPath(stateDir);
                  file.append("gecko-shell");
                  file.append("kokoa-panel.url");
                  if (file.exists()) {
                    // 用 nsIFileInputStream + 显式 UTF-8 解码（FileUtils.readFileToString
                    // 在新版已废弃；IOUtils.readUTF8 是 async，本函数不是 async）
                    const stream = Cc[
                      "@mozilla.org/network/file-input-stream;1"
                    ].createInstance(Ci.nsIFileInputStream);
                    stream.init(file, -1, -1, 0);
                    const raw = NetUtil.readInputStreamToString(
                      stream,
                      stream.available(),
                      { charset: "UTF-8" }
                    );
                    stream.close();
                    if (raw && raw.trim()) {
                      url = raw.trim();
                      urlSource = "file:kokoa-panel.url";
                    }
                  }
                }
              } catch (e) {
                // 文件不存在是正常情况，继续回退
              }
            }

            // 3) 兜底 —— 明确告诉用户这里【可能没有 token】
            if (!url) {
              url = KOKOA_DEFAULT_DSH_URL;
              urlSource = "hardcoded(no token)";
            }

            console.info("[Kokoa] opening AI workspace: " + urlSource + " -> " + url);

            // 没有 token 时给出可操作的提示，而不是让 dsh 报一句看不懂的错
            if (!/[?&]token=/.test(url)) {
              console.warn(
                "[Kokoa] AI workspace URL has no token. dsh will show " +
                  "\u0027web authentication required\u0027. Set KOKOA_DSH_URL " +
                  "env var (the dsh CLI prints the full URL with token) or write " +
                  "it to <KOKOA_STATE_DIR>/gecko-shell/kokoa-panel.url"
              );
            }

            gBrowser.selectedTab = gBrowser.addTab(url, {
              triggeringPrincipal:
                Services.scriptSecurityManager.getSystemPrincipal(),
            });
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

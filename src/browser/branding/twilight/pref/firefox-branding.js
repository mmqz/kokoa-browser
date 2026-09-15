/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// 【Kokoa 覆盖文件】
//
// 为什么需要这个文件：
//   surfer 的 src/commands/patches/branding-patch.ts L405-443 会【生成】
//   <engine>/browser/branding/<brand>/pref/firefox-branding.js，
//   而它里面的 URL 是【硬编码的 zen-browser.app】（L421-L436）——
//   不用任何变量，改 surfer.json 也无效。
//
//   后果（用户实测报的）：
//     · 每次更新后跳转到 https://zen-browser.app/whatsnew
//     · 「关于」里的发行说明指向 zen-browser.app
//     · 欢迎页 / 隐私政策页指向 zen-browser.app
//
// 为什么这样能覆盖：
//   CI 日志的顺序（07:49:11）：
//     [START] Apply 2 branding patches      <- surfer 生成上面那个文件
//     [FINISH] Apply 2 branding patches
//     [START] Apply 4 folder patches        <- ★ 之后才应用 src/ 覆盖
//       [FINISH] Apply browser              <- src/browser/ 在这时覆盖
//     [FINISH] Apply 4 folder patches
//   所以 src/browser/branding/<brand>/pref/firefox-branding.js 会赢。
//
//   （同一手法已被验证：src/browser/branding/twilight/branding.nsi 就这样生效了，
//     产物里的 CodeName=Kokoa Twilight 是证据。）
//
// 指向哪里：
//   目前指向我们的仓库（我们还没有官网/发行说明页）。
//   等有了官网，把下面换成对应的 URL 即可。

pref("startup.homepage_override_url", "https://github.com/tomjiu/kokoa-browser");
pref("startup.homepage_welcome_url", "https://github.com/tomjiu/kokoa-browser");
pref("startup.homepage_welcome_url.additional", "https://github.com/tomjiu/kokoa-browser");

// Give the user x seconds to react before showing the big UI. default=192 hours
pref("app.update.promptWaitTime", 691200);
// app.update.url.manual: URL user can browse to manually if for some reason
// all update installation attempts fail.
// app.update.url.details: a default value for the "More information about this
// update" link supplied in the "An update is available" page of the update
// wizard.
pref("app.update.url.manual", "https://github.com/tomjiu/kokoa-browser");
pref("app.update.url.details", "https://github.com/tomjiu/kokoa-browser");
pref("app.releaseNotesURL", "https://github.com/tomjiu/kokoa-browser");
pref("app.releaseNotesURL.aboutDialog", "https://github.com/tomjiu/kokoa-browser");
pref("app.releaseNotesURL.prompt", "https://github.com/tomjiu/kokoa-browser");

// Number of usages of the web console.
// If this is less than 5, then pasting code into the web console is disabled
pref("devtools.selfxss.count", 5);

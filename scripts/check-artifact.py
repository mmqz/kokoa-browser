import zipfile, sys, re, glob, os, json
sys.stdout.reconfigure(encoding='utf-8')
"""
核对一次构建产物（不需要实机）。

用法: python scripts/check-artifact.py <产物目录> [--json]

查什么：
  1. Kokoa 模块是否进包（modules/zen/Kokoa*.mjs）
  2. pref 默认值是否内联进 defaults/preferences/firefox.js
  3. 品牌名（brand.ftl 五项）
  4. 欢迎页大标题是否已删
  5. 新标签页 hideLogo
"""

d = sys.argv[1] if len(sys.argv) > 1 else None
if not d:
    print('用法: python scripts/check-artifact.py <产物目录>'); sys.exit(2)

omni = os.path.join(d, 'omni.ja')
if not os.path.exists(omni):
    zips = sorted(glob.glob(os.path.join(d, '**', '*.zip'), recursive=True),
                  key=os.path.getsize, reverse=True)
    for zp in zips:
        try: zf = zipfile.ZipFile(zp)
        except Exception: continue
        for n in zf.namelist():
            if n.endswith('browser/omni.ja'):
                open(omni, 'wb').write(zf.read(n)); break
        if os.path.exists(omni): break

if not os.path.exists(omni):
    print('找不到 omni.ja'); sys.exit(2)

z = zipfile.ZipFile(omni)
names = z.namelist()
results = []

def chk(name, cond, detail=''):
    results.append((bool(cond), name, detail))

# 1. Kokoa 模块
mods = ['KokoaAiPanel','KokoaAiSplit','KokoaDshSessions','KokoaDshSidecar','KokoaWorkspaceSessions','KokoaMenubar']
for m in mods:
    hit = [n for n in names if 'modules/zen/' in n and m in n]
    chk('模块进包: ' + m, hit, hit[0] if hit else '不在产物')

# 2. pref 默认值
ff = 'defaults/preferences/firefox.js'
if ff in names:
    t = z.read(ff).decode('utf-8','replace')
    # 收两个前缀：kokoa.menu.*（菜单）与 browser.shell.*（首次运行/默认浏览器）
    prefs = {}
    for _m in re.finditer(r'pref\(\s*"((?:kokoa\.menu|browser\.shell)\.[^"]+)"\s*,\s*([^)]{0,24})\)', t):
        prefs[_m.group(1)] = _m.group(2).strip()
    expect = {
        'kokoa.menu.new-tab.visible': 'true',
        'kokoa.menu.new-window.visible': 'true',
        'kokoa.menu.print.visible': 'false',
        'kokoa.menu.fxa.visible': 'false',
        'kokoa.menu.save-file.visible': 'false',
        # 【2026-09-16】首次运行 / 默认浏览器 / 任务栏（用户要求不弹）
        'browser.shell.checkDefaultBrowser': 'false',
        'browser.shell.setDefaultBrowserUserChoice': 'false',
        'browser.shell.setDefaultGuidanceNotifications': 'false',
        'browser.shell.skipDefaultBrowserCheckOnFirstRun': 'true',
        'browser.shell.pinToTaskbar': 'false',
    }
    for k, v in expect.items():
        got = prefs.get(k)
        chk('pref ' + k + ' = ' + v, got == v, ('实际 ' + got) if got else '缺')
else:
    chk('存在 firefox.js', False, '不在产物')

# 2b. ★ 欢迎页 URL 不能指向 GitHub（2026-09-16 实机验收踩的坑）
# 【注意】这几条在 firefox-branding.js，不是 firefox.js（踩过）
fbr = 'defaults/preferences/firefox-branding.js'
if fbr in names:
    t = z.read(fbr).decode('utf-8','replace')
    bad = []
    for k in ['startup.homepage_welcome_url', 'startup.homepage_welcome_url.additional', 'startup.homepage_override_url']:
        m = re.search(r'pref\(\s*"' + re.escape(k) + r'"\s*,\s*"([^"]*)"', t)
        if m and m.group(1).strip():
            bad.append(k + ' -> ' + m.group(1)[:40])
    chk('★ 欢迎页 URL 不指向外部站点（不打开 GitHub）', not bad,
        '; '.join(bad) if bad else '全部为空')

# 3. 品牌名
bftl = [n for n in names if n.endswith('brand.ftl') and '/en-US/' in n]
if bftl:
    t = z.read(bftl[0]).decode('utf-8','replace')
    for k in ['-brand-shorter-name','-brand-short-name','-brand-full-name','-brand-product-name','-vendor-short-name']:
        m = re.search(re.escape(k) + r'\s*=\s*(.+)', t)
        val = m.group(1).strip() if m else ''
        chk('品牌 ' + k + ' = Kokoa*', 'Kokoa' in val, val)
else:
    chk('存在 en-US brand.ftl', False)

# 4. 欢迎页大标题
zw = [n for n in names if 'ZenWelcome' in n and n.endswith('.mjs')]
if zw:
    t = z.read(zw[0]).decode('utf-8','replace')
    chk('欢迎页大标题已删', 'zen-welcome-title-line1' not in t,
        '仍引用 line1' if 'zen-welcome-title-line1' in t else '已删')

# 5. hideLogo
asx = [n for n in names if 'ActivityStream.sys.mjs' in n]
if asx:
    t = z.read(asx[0]).decode('utf-8','replace')
    m = re.search(r'"hideLogo",\s*\{[^}]*value:\s*(true|false)', t)
    v = m.group(1) if m else '?'
    chk('新标签页 hideLogo = true', v == 'true', '实际 ' + v)

# 输出
npass = sum(1 for r in results if r[0])
nfail = len(results) - npass
for okk, name, detail in results:
    print(('  OK   ' if okk else '  FAIL ') + name + (('  <- ' + detail) if (detail and not okk) else ''))
print('')
print('=== %d 通过 / %d 失败 ===' % (npass, nfail))
sys.exit(0 if nfail == 0 else 1)
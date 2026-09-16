import zipfile, sys, glob, os
# 从产物 zip 里解出 browser/omni.ja
# 用法: python scripts/extract-omnija.py <产物目录> <输出 omni.ja 路径>
#
# 【注意】产物目录下【不止一个】zip：
#   有主产物 kokoa-*.win64.zip，也有别的（jsshell 等）。
#   所以要挑【含 browser/omni.ja】的那个，不能取第一个。
d = sys.argv[1]
out = sys.argv[2]
zips = sorted(glob.glob(os.path.join(d, "**", "*.zip"), recursive=True),
              key=os.path.getsize, reverse=True)
for zpath in zips:
    try:
        zf = zipfile.ZipFile(zpath)
    except Exception:
        continue
    for n in zf.namelist():
        if n.endswith("browser/omni.ja"):
            open(out, "wb").write(zf.read(n))
            print("  解出 %s (%d 字节) 来自 %s" % (out, os.path.getsize(out),
                  os.path.basename(zpath)))
            sys.exit(0)
print("  所有 zip 里都没有 browser/omni.ja")
sys.exit(1)
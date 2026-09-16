import zipfile, os, sys
# 从 omni.ja 抽出 modules/zen/Kokoa*.mjs
# 用法: python scripts/extract-kokoa-modules.py <omni.ja> <输出目录>
zf = zipfile.ZipFile(sys.argv[1])
dst = sys.argv[2]
os.makedirs(dst, exist_ok=True)
n = 0
for nm in zf.namelist():
    if "modules/zen/Kokoa" in nm and nm.endswith(".mjs"):
        open(os.path.join(dst, nm.split("/")[-1]), "wb").write(zf.read(nm))
        n += 1
print("  抽出 %d 个" % n)
"""Regenerate the digit-only index font; no runtime/build Python dependency.

python3 -m venv .local/font-tools
.local/font-tools/bin/pip install fonttools==4.66.1 brotli==1.2.0
.local/font-tools/bin/python scripts/subset-index-font.py
"""
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parent.parent
package = root / "node_modules/@fontsource-variable/source-serif-4"
font = TTFont(package / "files/source-serif-4-latin-wght-italic.woff2", recalcTimestamp=False)
options = subset.Options()
options.layout_features = ["*"]
options.name_IDs = ["*"]
options.name_legacy = True
subsetter = subset.Subsetter(options=options)
subsetter.populate(unicodes=[0x20, *range(0x30, 0x3A)])
subsetter.subset(font)
# Give the derivative its own family; preserve copyright/license and axis names.
names = {1: "Ningling Index Serif", 3: "NinglingIndexSerif-Italic", 4: "Ningling Index Serif Italic", 6: "NinglingIndexSerif-Italic", 16: "Ningling Index Serif"}
for record in font["name"].names:
    if record.nameID in names:
        record.string = names[record.nameID].encode(record.getEncoding())
output = root / "app/fonts"
output.mkdir(exist_ok=True)
font.save(output / "index-digits.woff2")
(output / "OFL.txt").write_bytes((package / "LICENSE").read_bytes())

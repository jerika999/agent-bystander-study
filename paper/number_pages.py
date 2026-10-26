"""Stamp page numbers on every page after the title page, starting at 1.

Usage: python number_pages.py <in.pdf> <out.pdf>
The title page (PDF page 1) stays unnumbered, so the main text reads as pages 1-8.
"""
import sys

import fitz

src, dst = sys.argv[1], sys.argv[2]
doc = fitz.open(src)
for i in range(1, len(doc)):
    page = doc[i]
    label = str(i)
    size = 9
    width = fitz.get_text_length(label, fontname="tiro", fontsize=size)
    x = (page.rect.width - width) / 2
    y = page.rect.height - 0.55 * 72  # inside the 1-inch bottom margin
    page.insert_text((x, y), label, fontname="tiro", fontsize=size, color=(0.3, 0.3, 0.3))
doc.save(dst, garbage=3, deflate=True)
print(f"numbered {len(doc) - 1} pages -> {dst}")

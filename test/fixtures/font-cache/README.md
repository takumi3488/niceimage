# Renderer fixtures

These assets are only for local tests and tarball smoke checks. They are not shipped in the npm package.

- `NotoSans-*.ttf`: ASCII subsets of the [Noto Project's regular and bold fonts](https://github.com/notofonts/notofonts.github.io/tree/d14cc173a70dc57962ed2d4ad278fc9df83bf9f3/fonts/NotoSans/full/ttf). Copyright 2022 The Noto Project Authors.
- `NotoSansJP-*.otf`: subsets for the Japanese text in `src/render.test.ts`, from [Noto CJK Sans 2.004](https://github.com/notofonts/noto-cjk/tree/523d033d6cb47f4a80c58a35753646f5c3608a78/Sans/SubsetOTF/JP). Copyright 2014–2021 Adobe.
- `emoji/1f389.svg`: a synthetic SVG for the emoji fallback path, not Twemoji artwork.

The fonts are under [SIL OFL 1.1](OFL.txt). The subsets were generated with
FontTools 4.60.1 using `--name-IDs='*' --no-hinting` and either
`--unicodes=U+0020-007E` or `--text` with the Japanese fixture text.

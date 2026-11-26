# niceimage

`nimg` generates an image from a prompt (and optional reference images) by having an LLM write [Satori](https://github.com/vercel/satori) code, rendering it to SVG, and rasterizing it to PNG.

## Requirements

[Bun](https://bun.sh) >= 1.2. The CLI ships as TypeScript and is executed by Bun directly (`#!/usr/bin/env bun`); Node.js is not supported.

On a cold font cache, rendering downloads Noto fonts from GitHub and emoji
assets from cdnjs as needed.

## Install

```sh
bun add -g niceimage   # installs the `nimg` binary
bunx niceimage --help  # or run without installing
```

## Usage

```sh
nimg "a dark landing page hero for a CLI image generator"
nimg -i ref.png -o out.png -W 1200 -H 630 --scale 2 "match this style"
```

Run `nimg --help` for all options. With a TTY, `nimg` stays interactive after the first render and accepts revision requests at the `nimg> ` prompt.

### Read local files with Pi

```sh
nimg --allow-read "use the palette in ./palette.txt to design a landing page hero"
```

Pi's built-in `read` tool is off by default. Only `--allow-read` enables it for
that invocation; Pi project settings cannot enable it in `nimg`. `render_image`
and reference images (`--image`) work with or without the flag. No other Pi
tools are enabled.

The flag does not change Pi's normal access checks or OS permissions. Pi does
not ask for approval on each read, and paths are not confined to the working
directory. File contents read by Pi can be sent to the selected model provider.

## Development

```sh
bun install
bun test
bun run fmt      # biome format check (`fmt:fix` to write)
bun run lint     # oxlint (`lint:fix` to fix)
bun run typecheck
./scripts/pack_smoke.sh  # pack the tarball, install it, run the CLI + a render from node_modules
```

Renderer tests and the tarball smoke render use local font and emoji fixtures.

## Support

If you find niceimage useful, consider [sponsoring takumi3488](https://github.com/sponsors/takumi3488)
to support its development and maintenance.

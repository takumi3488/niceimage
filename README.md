# niceimage

`nimg` generates an image from a prompt (and optional reference images) by having an LLM write [Satori](https://github.com/vercel/satori) code, rendering it to SVG, and rasterizing it to PNG.

## Requirements

[Bun](https://bun.sh) >= 1.2. The CLI ships as TypeScript and is executed by Bun directly (`#!/usr/bin/env bun`); Node.js is not supported.

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

## Development

```sh
bun install
bun test
bun run fmt      # biome format check (`fmt:fix` to write)
bun run lint     # oxlint (`lint:fix` to fix)
bun run typecheck
./scripts/pack_smoke.sh  # pack the tarball, install it, run the CLI + a render from node_modules
```

import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Resvg, initWasm } from "@resvg/resvg-wasm";
import satori from "satori";
import { baseFonts, loadAdditionalAsset } from "./fonts.ts";

export type RenderContext = { width: number; height: number; images: string[] };
export type RenderResult = { svg: string; png: Uint8Array };

const RENDER_DIR = join(import.meta.dir, "..", ".cache", "renders");
const PRAGMA =
	"/** @jsxRuntime automatic */\n/** @jsxImportSource satori/jsx */\n";
const PRAGMA_RE = /^[ \t]*\/\*\*?\s*@jsx[A-Za-z]*\b[^*]*\*\/[ \t]*\r?\n?/gm;
const WASM_READY = initWasm(
	Bun.file(
		Bun.resolveSync("@resvg/resvg-wasm/index_bg.wasm", import.meta.dir),
	).arrayBuffer(),
);

export async function renderModule(
	code: string,
	ctx: RenderContext,
	scale: number,
): Promise<RenderResult> {
	mkdirSync(RENDER_DIR, { recursive: true });
	const file = join(RENDER_DIR, `render-${crypto.randomUUID()}.tsx`);
	await Bun.write(file, PRAGMA + code.replace(PRAGMA_RE, ""));

	let element: unknown;
	try {
		// Runtime-generated TSX must be compiled by Bun in the package context.
		const mod = await import(file);
		if (typeof mod.default !== "function") {
			throw new Error(
				"module must `export default` a function ({ width, height, images }) => JSX element",
			);
		}
		element = await mod.default(ctx);
	} finally {
		rmSync(file, { force: true });
	}

	const svg = await satori(element as Parameters<typeof satori>[0], {
		width: ctx.width,
		height: ctx.height,
		fonts: await baseFonts(),
		loadAdditionalAsset,
	});
	await WASM_READY;
	const resvg = new Resvg(svg, {
		fitTo: { mode: "width", value: Math.round(ctx.width * scale) },
		font: { loadSystemFonts: false },
	});
	const rendered = resvg.render();
	try {
		return { svg, png: rendered.asPng() };
	} finally {
		rendered.free();
		resvg.free();
	}
}

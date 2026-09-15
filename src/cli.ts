#!/usr/bin/env bun
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import type { ImageContent } from "@earendil-works/pi-ai";
import { createGenerator, type Generated, type Generator } from "./agent.ts";
import type { RenderContext } from "./render.ts";

type Reference = { content: ImageContent; dataUrl: string };

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

const USAGE = `Usage: nimg [options] <prompt>

Generate an image from a prompt (and optional reference images) by having an LLM write Satori code.

Options:
  -i, --image <path>      reference image (png/jpeg/gif/webp); repeatable
  -o, --output <path>     output file; .svg writes SVG, anything else PNG (default: ./nimg-<timestamp>.png)
  -W, --width <px>        canvas width (default 1200)
  -H, --height <px>       canvas height (default 630)
      --scale <n>         PNG raster scale, e.g. 2 for @2x (default 1)
  -m, --model <spec>      pi model, e.g. anthropic/claude-opus-4-5:high (default: pi settings default)
      --max-renders <n>   max render_image calls (default 3)
      --code <path>       also write the final TSX module here (rewritten every turn)
      --open / --no-open  open the output in the OS image viewer after the first render
                          (default: on in interactive mode, off otherwise)
      --no-interactive    one-shot even when stdin is a TTY
  -h, --help

Interactive mode (stdin is a TTY): after the first render, type revision requests at the \`nimg> \` prompt.
Empty line is ignored. /q, Ctrl-D, or Ctrl-C at the prompt exits; Ctrl-C during generation aborts that turn.`;

const log = (line: string) => process.stderr.write(`${line}\n`);

function usageError(message: string): never {
	console.error(`nimg: ${message}\n\n${USAGE}`);
	process.exit(2);
}

function positiveNumber(value: string, flag: string, integer = false): number {
	const parsed = Number(value);
	if (
		!Number.isFinite(parsed) ||
		parsed <= 0 ||
		(integer && !Number.isInteger(parsed))
	)
		usageError(`invalid --${flag}`);
	return parsed;
}

function openViewer(path: string): void {
	const command =
		process.platform === "darwin"
			? "open"
			: process.platform === "linux"
				? "xdg-open"
				: undefined;
	if (!command) {
		log("[nimg] --open is not supported on this platform");
		return;
	}
	try {
		Bun.spawn([command, path], {
			stdio: ["ignore", "ignore", "ignore"],
		}).unref();
	} catch (error) {
		log(
			`[nimg] could not open viewer: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

async function loadReference(path: string): Promise<Reference> {
	const file = Bun.file(path);
	if (!(await file.exists())) throw new Error(`image not found: ${path}`);
	const mimeType = file.type.split(";")[0] ?? "";
	if (!IMAGE_TYPES.includes(mimeType))
		throw new Error(`unsupported image type: ${path}`);
	const data = Buffer.from(await file.arrayBuffer()).toString("base64");
	return {
		content: { type: "image", data, mimeType },
		dataUrl: `data:${mimeType};base64,${data}`,
	};
}

function parseCliArgs() {
	try {
		return parseArgs({
			allowPositionals: true,
			options: {
				image: { type: "string", short: "i", multiple: true },
				output: { type: "string", short: "o" },
				width: { type: "string", short: "W", default: "1200" },
				height: { type: "string", short: "H", default: "630" },
				scale: { type: "string", default: "1" },
				model: { type: "string", short: "m" },
				"max-renders": { type: "string", default: "3" },
				code: { type: "string" },
				open: { type: "boolean" },
				"no-open": { type: "boolean" },
				"no-interactive": { type: "boolean" },
				help: { type: "boolean", short: "h" },
			},
		});
	} catch (error) {
		usageError(error instanceof Error ? error.message : String(error));
	}
}

const parsed = parseCliArgs();
if (parsed.values.help) {
	console.log(USAGE);
	process.exit(0);
}

const interactive =
	process.stdin.isTTY === true && !parsed.values["no-interactive"];
const open = parsed.values["no-open"]
	? false
	: (parsed.values.open ?? interactive);
const rl = interactive
	? createInterface({
			input: process.stdin,
			output: process.stderr,
			terminal: true,
		})
	: undefined;
let closedByInput = false;
const closed = new Promise<null>((resolve) => {
	rl?.once("close", () => {
		closedByInput = true;
		resolve(null);
	});
});
let busy = false;
let generator: Generator | undefined;
rl?.on("SIGINT", () => {
	if (busy) void generator?.abort();
	else rl.close();
});

const defaultOutput = `nimg-${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}.png`;
let prompt = parsed.positionals.join(" ").trim();
if (!prompt && !process.stdin.isTTY) prompt = (await Bun.stdin.text()).trim();
if (!prompt) usageError("a prompt is required");

const output = parsed.values.output ?? defaultOutput;
const width = positiveNumber(parsed.values.width, "width", true);
const height = positiveNumber(parsed.values.height, "height", true);
const scale = positiveNumber(parsed.values.scale, "scale");
const maxRenders = positiveNumber(
	parsed.values["max-renders"],
	"max-renders",
	true,
);
let references: Reference[];
try {
	references = await Promise.all(
		(parsed.values.image ?? []).map((path) => loadReference(path)),
	);
} catch (error) {
	usageError(error instanceof Error ? error.message : String(error));
}

const imageContents = references.map((reference) => reference.content);
const ctx: RenderContext = {
	width,
	height,
	images: references.map((reference) => reference.dataUrl),
};

try {
	generator = await createGenerator({
		ctx,
		scale,
		maxRenders,
		model: parsed.values.model,
		cwd: process.cwd(),
		log,
	});
} catch (error) {
	console.error(
		`nimg: ${error instanceof Error ? error.message : String(error)}`,
	);
	process.exit(1);
}
const gen = generator;
if (closedByInput) {
	log("[nimg] cancelled");
	gen.dispose();
	process.exit(130);
}

let saved = false;
let opened = false;
async function save(result: Generated): Promise<void> {
	if (output.toLowerCase().endsWith(".svg"))
		await Bun.write(output, result.svg);
	else await Bun.write(output, result.png);
	if (parsed.values.code) await Bun.write(parsed.values.code, result.code);
	log(`[nimg] wrote ${output}`);
	if (!opened && open) {
		opened = true;
		openViewer(output);
	}
}

async function runTurn(
	text: string,
	images?: ImageContent[],
): Promise<boolean> {
	busy = true;
	try {
		const result = await gen.turn(text, images);
		if (!result) {
			log("[nimg] no successful render this turn");
			return false;
		}
		await save(result);
		return true;
	} catch (error) {
		log(`nimg: ${error instanceof Error ? error.message : String(error)}`);
		return false;
	} finally {
		busy = false;
	}
}

const firstText = `Canvas: ${width}x${height}px.\nReference images attached: ${imageContents.length}${imageContents.length ? ` (available as images[0..${imageContents.length - 1}])` : ""}.\n\nRequest:\n${prompt}`;
if (!rl) {
	process.once("SIGINT", () => {
		void gen.abort().finally(() => process.exit(130));
	});
	saved = await runTurn(firstText, imageContents);
	gen.dispose();
	if (saved) console.log(output);
	process.exit(saved ? 0 : 1);
}

saved = await runTurn(firstText, imageContents);
for (;;) {
	if (closedByInput) break;
	let line: string | null;
	try {
		line = await Promise.race([rl.question("\nnimg> "), closed]);
	} catch (error) {
		if (closedByInput) break;
		throw error;
	}
	if (line === null) break;
	const text = line.trim();
	if (text === "") continue;
	if (text === "/q" || text === "/quit" || text === "/exit") break;
	saved = (await runTurn(text)) || saved;
}
rl.close();
gen.dispose();
if (saved) console.log(output);
process.exit(saved ? 0 : 1);

import { existsSync, mkdirSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { Font as FontOptions } from "satori";

export const CACHE_DIR =
	process.env.NIMG_CACHE_DIR ??
	join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "nimg");
const FONT_DIR = join(CACHE_DIR, "fonts");
const EMOJI_DIR = join(CACHE_DIR, "emoji");
const NOTO = "https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts";
const CJK =
	"https://github.com/notofonts/noto-cjk/raw/Sans2.004/Sans/SubsetOTF";
const TWEMOJI = "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg";

type Weight = 400 | 700;
type FontSpec = { name: string; weight: Weight; url: string };

function noto(family: string, weights: Weight[] = [400, 700]): FontSpec[] {
	const name = family.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
	return weights.map((weight) => ({
		name,
		weight,
		url: `${NOTO}/${family}/full/ttf/${family}-${weight === 400 ? "Regular" : "Bold"}.ttf`,
	}));
}

function cjk(region: "JP" | "KR" | "SC" | "TC" | "HK"): FontSpec[] {
	return [400, 700].map((weight) => ({
		name: `Noto Sans ${region}`,
		weight: weight as Weight,
		url: `${CJK}/${region}/NotoSans${region}-${weight === 400 ? "Regular" : "Bold"}.otf`,
	}));
}

const BASE = noto("NotoSans");
const BY_LANG: Record<string, FontSpec[]> = {
	"ja-JP": cjk("JP"),
	"ko-KR": cjk("KR"),
	"zh-CN": cjk("SC"),
	"zh-TW": cjk("TC"),
	"zh-HK": cjk("HK"),
	"th-TH": noto("NotoSansThai"),
	"bn-IN": noto("NotoSansBengali"),
	"ar-AR": noto("NotoSansArabic"),
	"ta-IN": noto("NotoSansTamil"),
	"ml-IN": noto("NotoSansMalayalam"),
	"he-IL": noto("NotoSansHebrew"),
	"te-IN": noto("NotoSansTelugu"),
	devanagari: noto("NotoSansDevanagari"),
	kannada: noto("NotoSansKannada"),
	symbol: [...noto("NotoSansSymbols"), ...noto("NotoSansSymbols2", [400])],
	math: noto("NotoSansMath", [400]),
};

const downloads = new Map<string, Promise<ArrayBuffer>>();

function fetchCached(url: string, dir: string): Promise<ArrayBuffer> {
	const current = downloads.get(url);
	if (current) return current;

	const promise = (async () => {
		const path = join(dir, basename(new URL(url).pathname));
		if (existsSync(path)) return Bun.file(path).arrayBuffer();

		mkdirSync(dir, { recursive: true });
		const response = await fetch(url);
		if (!response.ok)
			throw new Error(`download failed ${response.status}: ${url}`);
		const part = `${path}.part`;
		await Bun.write(part, await response.arrayBuffer());
		renameSync(part, path);
		return Bun.file(path).arrayBuffer();
	})();

	downloads.set(url, promise);
	return promise;
}

async function toFontOptions(
	spec: FontSpec,
	lang?: string,
): Promise<FontOptions> {
	return {
		name: spec.name,
		weight: spec.weight,
		style: "normal",
		data: await fetchCached(spec.url, FONT_DIR),
		...(lang ? { lang } : {}),
	};
}

let baseFontsPromise: Promise<FontOptions[]> | undefined;
export const baseFonts = (): Promise<FontOptions[]> =>
	(baseFontsPromise ??= Promise.all(BASE.map((spec) => toFontOptions(spec))));

function emojiCode(char: string): string {
	const codePoints = [...char].map((part) => part.codePointAt(0)!.toString(16));
	return (
		char.includes("\u200d")
			? codePoints
			: codePoints.filter((part) => part !== "fe0f")
	).join("-");
}

export async function loadAdditionalAsset(
	code: string,
	segment: string,
): Promise<string | FontOptions[]> {
	if (code === "emoji") {
		try {
			const data = await fetchCached(
				`${TWEMOJI}/${emojiCode(segment)}.svg`,
				EMOJI_DIR,
			);
			return `data:image/svg+xml;base64,${Buffer.from(data).toString("base64")}`;
		} catch {
			return [];
		}
	}

	const specs = BY_LANG[code];
	if (!specs) return [];
	return Promise.all(specs.map((spec) => toFontOptions(spec, code)));
}

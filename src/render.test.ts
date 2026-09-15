import { expect, test } from "bun:test";
import { renderModule } from "./render.ts";

const code = `
export default function Image({ width, height }) {
	return <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", backgroundColor: "#111", color: "#fff", fontSize: 48 }}>
		<div>Hello niceimage</div>
		<div>日本語テキスト 🎉</div>
	</div>;
}
`;

test("renders TSX with fallback fonts and emoji", async () => {
	const result = await renderModule(
		code,
		{ width: 400, height: 200, images: [] },
		1,
	);
	expect(result.svg.startsWith("<svg")).toBe(true);
	expect([...result.png.subarray(0, 8)]).toEqual([
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
	]);
	expect(
		new DataView(result.png.buffer, result.png.byteOffset).getUint32(16),
	).toBe(400);
	expect(
		new DataView(result.png.buffer, result.png.byteOffset).getUint32(20),
	).toBe(200);
	expect(result.svg).toContain("<path");
	expect(result.svg).toContain("<image");
}, 60_000);

import type { ImageContent, TextContent } from "@earendil-works/pi-ai";
import {
	createAgentSession,
	DefaultResourceLoader,
	defineTool,
	getAgentDir,
	ModelRuntime,
	resolveCliModel,
	SessionManager,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { systemPrompt } from "./prompt.ts";
import {
	type RenderContext,
	type RenderResult,
	renderModule,
} from "./render.ts";

export type GeneratorOptions = {
	ctx: RenderContext;
	scale: number;
	maxRenders: number;
	model?: string;
	cwd: string;
	log: (line: string) => void;
};
export type Generated = RenderResult & { code: string };
export type Generator = {
	turn(text: string, images?: ImageContent[]): Promise<Generated | undefined>;
	abort(): Promise<void>;
	dispose(): void;
};

export async function createGenerator(o: GeneratorOptions): Promise<Generator> {
	const modelRuntime = await ModelRuntime.create();
	const resolved = o.model
		? resolveCliModel({ cliModel: o.model, modelRuntime })
		: undefined;
	if (resolved?.error) throw new Error(resolved.error);
	if (resolved?.warning) o.log(resolved.warning);

	let attempts = 0;
	let turnResult: Generated | undefined;
	const renderTool = defineTool({
		name: "render_image",
		label: "Render image",
		description:
			"Render a complete Satori TSX module to the output image. Pass the ENTIRE module source each call. Returns the rendered image (or the error) so you can iterate.",
		parameters: Type.Object({
			code: Type.String({
				description:
					"Complete TSX module source. Must `export default` a function ({ width, height, images }) => JSX element.",
			}),
		}),
		async execute(_id, { code }, _signal, _onUpdate, ctx) {
			if (attempts >= o.maxRenders) {
				throw new Error(
					`Render limit (${o.maxRenders}) reached; nothing rendered. Do not call render_image again. Reply with a short summary.`,
				);
			}
			const n = ++attempts;
			let result: RenderResult;
			try {
				result = await renderModule(code, o.ctx, o.scale);
			} catch (error) {
				throw new Error(
					`Render #${n} failed:\n${error instanceof Error ? error.message : String(error)}\nFix the module and call render_image again.`,
				);
			}
			turnResult = { ...result, code };
			const left = o.maxRenders - n;
			const summary: TextContent = {
				type: "text",
				text: `Render #${n} succeeded (${o.ctx.width}x${o.ctx.height}). ${left} render call(s) left. Review the image; call render_image again with an improved module if needed, otherwise reply with a short summary.`,
			};
			const content: (TextContent | ImageContent)[] = [summary];
			if (ctx.model?.input.includes("image")) {
				content.push({
					type: "image",
					data: Buffer.from(result.png).toString("base64"),
					mimeType: "image/png",
				});
			} else {
				summary.text += " (Your model cannot view images; judge by the code.)";
			}
			return { content, details: { attempt: n } };
		},
	});

	const loader = new DefaultResourceLoader({
		cwd: o.cwd,
		agentDir: getAgentDir(),
		noExtensions: true,
		noSkills: true,
		noPromptTemplates: true,
		noThemes: true,
		noContextFiles: true,
		systemPromptOverride: () => systemPrompt(o.maxRenders),
	});
	await loader.reload();

	const { session } = await createAgentSession({
		cwd: o.cwd,
		model: resolved?.model,
		thinkingLevel: resolved?.thinkingLevel,
		modelRuntime,
		resourceLoader: loader,
		tools: ["render_image"],
		customTools: [renderTool],
		sessionManager: SessionManager.inMemory(o.cwd),
	});

	const unsubscribe = session.subscribe((event) => {
		if (
			event.type === "message_update" &&
			event.assistantMessageEvent.type === "text_delta"
		) {
			process.stderr.write(event.assistantMessageEvent.delta);
		} else if (
			event.type === "tool_execution_start" &&
			event.toolName === "render_image"
		) {
			o.log(`\n[nimg] rendering (#${attempts + 1})...`);
		} else if (
			event.type === "tool_execution_end" &&
			event.toolName === "render_image"
		) {
			o.log(event.isError ? "[nimg] render failed" : "[nimg] render ok");
		} else if (event.type === "auto_retry_start") {
			o.log(`[nimg] retry ${event.attempt}: ${event.errorMessage}`);
		}
	});

	return {
		async turn(text, images) {
			attempts = 0;
			turnResult = undefined;
			await session.prompt(text, images?.length ? { images } : undefined);
			if (!turnResult && session.agent.state.errorMessage) {
				throw new Error(session.agent.state.errorMessage);
			}
			return turnResult;
		},
		abort: () => session.abort(),
		dispose: () => {
			unsubscribe();
			session.dispose();
		},
	};
}

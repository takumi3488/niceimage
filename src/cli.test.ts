import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

type CompletionRequest = {
	tools: { function: { name: string } }[];
	messages: { role: string; content: string; tool_call_id?: string }[];
};

test.each([false, true])("Pi read opt-in: %s", async (allowRead) => {
	const cwd = await mkdtemp(join(tmpdir(), "nimg-pi-"));
	try {
		const requests: CompletionRequest[] = [];
		const fixture = "local palette: navy and amber";
		const readCall = {
			index: 0,
			id: "call_fixture",
			type: "function",
			function: {
				name: "read",
				arguments: '{"path":"palette.txt","offset":2}',
			},
		};
		using server = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			routes: {
				"/v1/chat/completions": async (request) => {
					requests.push((await request.json()) as CompletionRequest);
					const choice =
						requests.length === 1
							? {
									finish_reason: "tool_calls",
									delta: { tool_calls: [readCall] },
								}
							: { finish_reason: "stop", delta: { content: "Done" } };
					const chunk = {
						id: "fixture-completion",
						choices: [{ index: 0, ...choice }],
					};
					return new Response(
						`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`,
						{
							headers: { "content-type": "text/event-stream" },
						},
					);
				},
			},
		});
		const agentDir = join(cwd, "agent");
		await Bun.write(join(cwd, "palette.txt"), `palette\n${fixture}`);
		await Bun.write(
			join(cwd, ".pi", "settings.json"),
			'{"defaultTools":["read","bash"]}',
		);
		await Bun.write(
			join(agentDir, "settings.json"),
			'{"cacheWarming":"off","enableInstallTelemetry":false}',
		);
		await Bun.write(
			join(agentDir, "models.json"),
			JSON.stringify({
				providers: {
					fixture: {
						baseUrl: new URL("/v1", server.url).href,
						api: "openai-completions",
						apiKey: "loopback-only",
						models: [{ id: "local" }],
					},
				},
			}),
		);

		const child = Bun.spawn(
			[
				process.execPath,
				"--no-env-file",
				join(import.meta.dir, "cli.ts"),
				"--model",
				"fixture/local",
				...(allowRead ? ["--allow-read"] : []),
				"Use the palette in palette.txt",
			],
			{
				cwd,
				env: { HOME: cwd, PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: "1" },
				stdout: "ignore",
				stderr: "pipe",
				timeout: 4_000,
			},
		);
		const [stderr] = await Promise.all([child.stderr.text(), child.exited]);
		expect(requests, stderr).toHaveLength(2);
		expect(requests[0]?.tools.map((tool) => tool.function.name).sort()).toEqual(
			allowRead ? ["read", "render_image"] : ["render_image"],
		);
		const result = requests[1]?.messages.find(
			(message) =>
				message.role === "tool" && message.tool_call_id === "call_fixture",
		);
		if (allowRead) expect(result?.content).toBe(fixture);
		else expect(result?.content ?? "").not.toContain(fixture);
	} finally {
		await rm(cwd, { recursive: true, force: true });
	}
});

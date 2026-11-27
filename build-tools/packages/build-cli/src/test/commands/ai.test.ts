/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { mock } from "node:test";
import { CopilotClient, type CopilotSession, type SessionConfig } from "@github/copilot-sdk";
import { Config } from "@oclif/core";
import { expect } from "chai";
import execa from "execa";
import { describe, it } from "mocha";
import AiCommand, {
	assertSafeAliasSelection,
	buildLauncherPrompt,
	FALLBACK_MODEL,
	normalizePromptAnswer,
	readAssetFile,
	SUPPORTED_ALIASES,
} from "../../commands/ai.js";
import { runAiSession } from "../../library/ai/copilotSession.js";

describe("ai command", () => {
	it("runs a recommendation-only session that denies permissions but can select an alias", async () => {
		const proposal = {
			alias: "dev",
			extraMcpArgs: ["server with spaces"],
			explanation: "Use the development profile.",
		};
		const executeRestrictedTool = mock.fn();
		const prompt = mock.fn(async (question: string, choices?: string[]) => {
			expect(question).to.equal("Which profile?");
			expect(choices).to.deep.equal(["dev", "oce"]);
			return " dev ";
		});
		const disconnect = mock.fn(async () => {});

		try {
			mock.method(CopilotClient.prototype, "start", async () => {});
			mock.method(CopilotClient.prototype, "ping", async () => ({
				message: "offline",
				timestamp: 0,
			}));
			mock.method(CopilotClient.prototype, "getAuthStatus", async () => ({
				isAuthenticated: true,
			}));
			const stop = mock.method(CopilotClient.prototype, "stop", async () => []);
			const createSession = mock.method(
				CopilotClient.prototype,
				"createSession",
				async (config: SessionConfig) =>
					({
						on: () => () => {},
						disconnect,
						sendAndWait: async ({ prompt: sessionPrompt }) => {
							expect(sessionPrompt).to.equal("Help me choose an agent.");
							expect(config.availableTools).to.deep.equal(["ask_user", "select_alias"]);
							expect(config.tools?.map((tool) => tool.name)).to.deep.equal(["select_alias"]);
							assert(config.onUserInputRequest);
							expect(
								await config.onUserInputRequest(
									{ question: "Which profile?", choices: ["dev", "oce"] },
									{ sessionId: "launcher-test" },
								),
							).to.deep.equal({ answer: "dev", wasFreeform: false });

							for (const kind of [
								"shell",
								"write",
								"mcp",
								"read",
								"url",
								"custom-tool",
							] as const) {
								const decision = await config.onPermissionRequest(
									{ kind },
									{ sessionId: "launcher-test" },
								);
								if (decision.kind === "approved") {
									executeRestrictedTool();
								}
								expect(decision.kind).to.equal("denied-by-rules");
							}
							expect(executeRestrictedTool.mock.callCount()).to.equal(0);

							const selectAlias = config.tools?.find((tool) => tool.name === "select_alias");
							assert(selectAlias);
							// The CLI bypasses permission requests only for tools with this flag.
							assert.equal(selectAlias.skipPermission, true);
							await selectAlias.handler(proposal, {
								sessionId: "launcher-test",
								toolCallId: "selection",
								toolName: "select_alias",
								arguments: proposal,
							});
							return undefined;
						},
					}) satisfies Pick<CopilotSession, "on" | "sendAndWait" | "disconnect">,
			);

			expect(
				await runAiSession({
					model: FALLBACK_MODEL,
					prompt: "Help me choose an agent.",
					ui: { output: () => {}, prompt },
				}),
			).to.deep.equal(proposal);
			expect(createSession.mock.callCount()).to.equal(1);
			expect(prompt.mock.callCount()).to.equal(1);
			expect(disconnect.mock.callCount()).to.equal(1);
			expect(stop.mock.callCount()).to.equal(1);
		} finally {
			mock.restoreAll();
		}
	});

	it("resolves a runnable Copilot CLI from the SDK dependency", async () => {
		const aiSessionModule = await import("../../library/ai/copilotSession.js");
		const resolver = Reflect.get(aiSessionModule, "resolveCopilotCliPath");
		const result = await execa(process.execPath, [resolver(), "--version"]);
		expect(result.stdout).to.match(
			/^GitHub Copilot CLI \d+\.\d+\.\d+(?:-[\dA-Za-z.-]+)?(?:\+[\dA-Za-z.-]+)?\.$/mu,
		);
	});

	it("supports the configured Copilot launchers", () => {
		expect(SUPPORTED_ALIASES).to.deep.equal(["dev", "copilot", "oce"]);
	});

	it("rejects a configured asset directory that does not exist", async () => {
		const tempDirectory = await mkdtemp(join(tmpdir(), "flub-ai-assets-test-"));
		const missingDirectory = join(tempDirectory, "missing");
		try {
			const config = await Config.load({ root: import.meta.url });
			const command = new AiCommand(["--assetDirectory", missingDirectory], config);
			let error: unknown;
			try {
				await command.init();
			} catch (caught) {
				error = caught;
			}

			expect(error).to.be.instanceOf(Error);
			expect((error as Error).message).to.include(missingDirectory);
		} finally {
			await rm(tempDirectory, { recursive: true, force: true });
		}
	});

	it("reads launcher assets from the configured directory", async () => {
		const tempDirectory = await mkdtemp(join(tmpdir(), "flub-ai-assets-test-"));
		try {
			await writeFile(join(tempDirectory, "launcher-prompt.md"), "configured prompt");
			expect(await readAssetFile(tempDirectory, undefined, "launcher-prompt.md")).to.equal(
				"configured prompt",
			);
		} finally {
			await rm(tempDirectory, { recursive: true, force: true });
		}
	});

	it("prefers the configured directory over repository fallbacks", async () => {
		const tempDirectory = await mkdtemp(join(tmpdir(), "flub-ai-assets-test-"));
		const configuredDirectory = join(tempDirectory, "configured");
		const repositoryDirectory = join(tempDirectory, "repo");
		try {
			await mkdir(configuredDirectory);
			await mkdir(join(repositoryDirectory, ".devcontainer"), { recursive: true });
			await writeFile(join(configuredDirectory, "launcher-prompt.md"), "configured prompt");
			await writeFile(
				join(repositoryDirectory, ".devcontainer", "launcher-prompt.md"),
				"repository prompt",
			);

			expect(
				await readAssetFile(configuredDirectory, repositoryDirectory, "launcher-prompt.md"),
			).to.equal("configured prompt");
		} finally {
			await rm(tempDirectory, { recursive: true, force: true });
		}
	});

	for (const relativeDirectory of [
		".devcontainer",
		".devcontainer/ai-agent-insiders",
		".devcontainer/ai-agent",
	]) {
		it(`reads launcher assets from the ${relativeDirectory} repository fallback`, async () => {
			const repositoryDirectory = await mkdtemp(join(tmpdir(), "flub-ai-assets-test-"));
			try {
				const fallbackDirectory = join(repositoryDirectory, relativeDirectory);
				await mkdir(fallbackDirectory, { recursive: true });
				await writeFile(join(fallbackDirectory, "launcher-prompt.md"), relativeDirectory);

				expect(
					await readAssetFile(undefined, repositoryDirectory, "launcher-prompt.md"),
				).to.equal(relativeDirectory);
			} finally {
				await rm(repositoryDirectory, { recursive: true, force: true });
			}
		});
	}

	it("prefers the root repository fallback over legacy locations", async () => {
		const repositoryDirectory = await mkdtemp(join(tmpdir(), "flub-ai-assets-test-"));
		try {
			for (const relativeDirectory of [
				".devcontainer",
				".devcontainer/ai-agent-insiders",
				".devcontainer/ai-agent",
			]) {
				const fallbackDirectory = join(repositoryDirectory, relativeDirectory);
				await mkdir(fallbackDirectory, { recursive: true });
				await writeFile(join(fallbackDirectory, "launcher-prompt.md"), relativeDirectory);
			}

			expect(
				await readAssetFile(undefined, repositoryDirectory, "launcher-prompt.md"),
			).to.equal(".devcontainer");
		} finally {
			await rm(repositoryDirectory, { recursive: true, force: true });
		}
	});

	it("does not use repository fallbacks when a directory is configured", async () => {
		const tempDirectory = await mkdtemp(join(tmpdir(), "flub-ai-assets-test-"));
		const configuredDirectory = join(tempDirectory, "configured");
		const repositoryDirectory = join(tempDirectory, "repo");
		try {
			await mkdir(configuredDirectory);
			await mkdir(join(repositoryDirectory, ".devcontainer"), { recursive: true });
			await writeFile(
				join(repositoryDirectory, ".devcontainer", "launcher-prompt.md"),
				"repository prompt",
			);

			expect(
				await readAssetFile(configuredDirectory, repositoryDirectory, "launcher-prompt.md"),
			).to.equal(undefined);
		} finally {
			await rm(tempDirectory, { recursive: true, force: true });
		}
	});

	it("uses the flub executable on PATH for the shell launcher", async () => {
		const tempDirectory = await mkdtemp(join(tmpdir(), "flub-ai-test-"));
		const fakeFlubPath = join(tempDirectory, "flub");
		const aliasScriptPath = resolve(
			process.cwd(),
			"../../../scripts/codespace-setup/agent-aliases.sh",
		);

		try {
			await writeFile(
				fakeFlubPath,
				[
					"#!/usr/bin/env bash",
					"while [ $# -gt 0 ]; do",
					'\tif [ "$1" = "--launchFile" ]; then',
					'\t\tprintf \'printf "launched\\\\n"\\n\' > "$2"',
					"\t\texit 0",
					"\tfi",
					"\tshift",
					"done",
					"exit 1",
				].join("\n"),
			);
			await chmod(fakeFlubPath, 0o755);

			const result = await execa(
				"bash",
				["-c", 'source "$1"; flub-ai', "flub-ai-test", aliasScriptPath.replaceAll("\\", "/")],
				{
					env: {
						...process.env,
						PATH: `${tempDirectory}${delimiter}${process.env.PATH ?? ""}`,
					},
				},
			);

			expect(result.stdout).to.equal("launched");
		} finally {
			await rm(tempDirectory, { recursive: true, force: true });
		}
	});

	it("keeps launcher prompt models aligned with the fallback model", async () => {
		const repositoryRoot = resolve(process.cwd(), "../../..");
		for (const relativePath of [
			".devcontainer/launcher-prompt.md",
			".devcontainer/ai-agent/launcher-prompt.md",
		]) {
			const prompt = await readFile(resolve(repositoryRoot, relativePath), "utf8");
			expect(prompt).to.match(new RegExp(`^model: ${FALLBACK_MODEL}$`, "mu"));
		}
	});

	it("allows all supported aliases", () => {
		const aliasSet = new Set<string>(SUPPORTED_ALIASES);
		for (const alias of SUPPORTED_ALIASES) {
			expect(() =>
				assertSafeAliasSelection({ alias, explanation: `launch ${alias}` }, aliasSet),
			).to.not.throw();
		}
	});

	it("renders the allowed alias list into the launcher prompt", () => {
		const prompt = buildLauncherPrompt({
			template:
				"## Alias Definitions\n{{aliasFileContent}}\n\n## Allowed Aliases\n{{allowedAliasesContent}}\n\n## Getting Started\n{{gettingStartedContent}}",
			aliasFileContent: "dev() {}",
			gettingStartedContent: "start here",
			allowedAliases: ["copilot"],
		});

		expect(prompt).to.include("- `copilot`");
		expect(prompt).to.not.include("{{allowedAliasesContent}}");
	});

	it("maps numbered prompt selections to the selected choice", () => {
		expect(normalizePromptAnswer("2", ["dev", "copilot", "oce"])).to.equal("copilot");
	});

	it("keeps freeform prompt answers unchanged", () => {
		expect(normalizePromptAnswer("help me debug", ["dev", "copilot"])).to.equal(
			"help me debug",
		);
		expect(normalizePromptAnswer("4", ["dev", "copilot"])).to.equal("4");
	});
});

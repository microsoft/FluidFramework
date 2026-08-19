/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect } from "chai";
import execa from "execa";
import { describe, it } from "mocha";

import {
	assertSafeAliasSelection,
	buildLauncherPrompt,
	getDevcontainerFileCandidates,
	normalizePromptAnswer,
	SUPPORTED_ALIASES,
} from "../../commands/ai.js";

describe("ai command", () => {
	it("resolves a runnable Copilot CLI from the SDK dependency", async () => {
		const aiSessionModule = await import("../../library/ai/copilotSession.js");
		const resolver = Reflect.get(aiSessionModule, "resolveCopilotCliPath");
		const result = await execa(process.execPath, [resolver(), "--version"]);
		expect(result.stdout).to.match(/^GitHub Copilot CLI \d+\.\d+\.\d+\./mu);
	});

	it("supports the configured Copilot launchers", () => {
		expect(SUPPORTED_ALIASES).to.deep.equal(["dev", "copilot", "oce"]);
	});

	it("resolves launcher assets from the default devcontainer", () => {
		expect(
			getDevcontainerFileCandidates("/workspace/package", "/workspace", "launcher-prompt.md"),
		).to.deep.equal([
			resolve("/workspace/package/.devcontainer/launcher-prompt.md"),
			resolve("/workspace/.devcontainer/launcher-prompt.md"),
		]);
	});

	it("deduplicates launcher asset paths at the repository root", () => {
		expect(
			getDevcontainerFileCandidates("/workspace", "/workspace", "GETTING_STARTED.md"),
		).to.deep.equal([resolve("/workspace/.devcontainer/GETTING_STARTED.md")]);
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
				"/usr/bin/bash",
				["-c", 'source "$1"; flub-ai', "flub-ai-test", aliasScriptPath],
				{
					env: {
						...process.env,
						PATH: `${tempDirectory}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`,
					},
				},
			);

			expect(result.stdout).to.equal("launched");
		} finally {
			await rm(tempDirectory, { recursive: true, force: true });
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

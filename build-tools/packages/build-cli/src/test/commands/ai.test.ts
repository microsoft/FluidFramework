/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";
import { describe, it } from "mocha";

import {
	assertSafeAliasSelection,
	buildLauncherPrompt,
	FALLBACK_ALIASES,
	normalizePromptAnswer,
	resolveAllowedAliases,
} from "../../commands/ai.js";

describe("ai command", () => {
	it("allows fallback aliases when no custom set provided", () => {
		for (const alias of FALLBACK_ALIASES) {
			expect(() =>
				assertSafeAliasSelection({ alias, explanation: `launch ${alias}` }),
			).to.not.throw();
		}
	});

	it("rejects unsupported aliases when no custom set provided", () => {
		expect(() =>
			assertSafeAliasSelection({ alias: "bash", explanation: "definitely not safe" }),
		).to.throw(/Unsupported AI alias selection: bash/);
	});

	it("accepts aliases in a custom set", () => {
		const customSet = new Set(["my-alias", "other-alias"]);
		expect(() =>
			assertSafeAliasSelection({ alias: "my-alias", explanation: "custom alias" }, customSet),
		).to.not.throw();
	});

	it("rejects aliases not in a custom set", () => {
		const customSet = new Set(["my-alias", "other-alias"]);
		expect(() =>
			assertSafeAliasSelection(
				{ alias: "claude", explanation: "not in custom set" },
				customSet,
			),
		).to.throw(/Unsupported AI alias selection: claude/);
	});

	it("falls back to the default aliases when the configured list is empty", () => {
		expect(resolveAllowedAliases([])).to.deep.equal([...FALLBACK_ALIASES]);
	});

	it("uses the configured aliases when provided", () => {
		expect(resolveAllowedAliases(["copilot", "oce"])).to.deep.equal(["copilot", "oce"]);
	});

	it("normalizes parsed alias lists", () => {
		expect(resolveAllowedAliases(["dev", "copilot", "dev", ""])).to.deep.equal([
			"dev",
			"copilot",
		]);
	});

	it("renders the configured alias list into the launcher prompt", () => {
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

	it("appends the configured alias list when the template lacks a placeholder", () => {
		const prompt = buildLauncherPrompt({
			template: "## Alias Definitions\n{{aliasFileContent}}",
			aliasFileContent: "dev() {}",
			allowedAliases: ["dev"],
		});

		expect(prompt).to.include("## Allowed Aliases for This Session");
		expect(prompt).to.include("- `dev`");
	});

	it("maps numbered prompt selections to the selected choice", () => {
		expect(normalizePromptAnswer("2", ["claude", "dev", "copilot"])).to.equal("dev");
	});

	it("keeps freeform prompt answers unchanged", () => {
		expect(normalizePromptAnswer("help me debug", ["claude", "dev"])).to.equal(
			"help me debug",
		);
		expect(normalizePromptAnswer("4", ["claude", "dev"])).to.equal("4");
	});
});

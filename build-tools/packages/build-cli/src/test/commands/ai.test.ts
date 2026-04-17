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
	it("allows aliases present in the provided set", () => {
		const aliasSet = new Set(["my-alias", "other-alias"]);
		expect(() =>
			assertSafeAliasSelection({ alias: "my-alias", explanation: "custom alias" }, aliasSet),
		).to.not.throw();
	});

	it("rejects aliases not in the provided set", () => {
		const aliasSet = new Set(["my-alias", "other-alias"]);
		expect(() =>
			assertSafeAliasSelection(
				{ alias: "claude", explanation: "not in set" },
				aliasSet,
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

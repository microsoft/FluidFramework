/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";
import { describe, it } from "mocha";

import {
	assertSafeAliasSelection,
	buildLauncherPrompt,
	normalizePromptAnswer,
	SUPPORTED_ALIASES,
} from "../../commands/ai.js";

describe("ai command", () => {
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
		expect(normalizePromptAnswer("2", ["claude", "dev", "copilot"])).to.equal("dev");
	});

	it("keeps freeform prompt answers unchanged", () => {
		expect(normalizePromptAnswer("help me debug", ["claude", "dev"])).to.equal(
			"help me debug",
		);
		expect(normalizePromptAnswer("4", ["claude", "dev"])).to.equal("4");
	});
});

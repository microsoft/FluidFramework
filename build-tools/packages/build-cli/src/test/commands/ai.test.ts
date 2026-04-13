/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";
import { describe, it } from "mocha";

import {
	assertSafeAliasSelection,
	normalizePromptAnswer,
	supportedAliases,
} from "../../commands/ai.js";

describe("ai command", () => {
	it("allows known agent aliases", () => {
		for (const alias of supportedAliases) {
			expect(() =>
				assertSafeAliasSelection({ alias, explanation: `launch ${alias}` }),
			).to.not.throw();
		}
	});

	it("rejects unsupported aliases", () => {
		expect(() =>
			assertSafeAliasSelection({ alias: "bash", explanation: "definitely not safe" }),
		).to.throw(/Unsupported AI alias selection: bash/);
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

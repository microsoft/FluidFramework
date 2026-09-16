/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { recommended } from "../../flat.mjs";
import { createESLintForConfig } from "./eslintConfigHelper.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ruleId = "@fluid-internal/fluid/no-hyphen-after-jsdoc-tag";

describe("custom Fluid rules", function () {
	this.timeout(60_000);

	it("runs custom rules through the exported config", async function () {
		const eslint = createESLintForConfig(recommended);
		const fixture = path.join(
			__dirname,
			"..",
			"rules",
			"test",
			"test-cases",
			"no-hyphen-after-jsdoc-tag",
			"test.ts",
		);
		const [result] = await eslint.lintFiles([fixture]);
		assert.ok(result !== undefined, "Expected a lint result");

		const violations = result.messages.filter((message) => message.ruleId === ruleId);
		assert.strictEqual(violations.length, 3);
	});
});

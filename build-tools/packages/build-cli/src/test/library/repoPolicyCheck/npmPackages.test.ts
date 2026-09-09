/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "mocha";

import { handlers } from "../../../library/repoPolicyCheck/npmPackages.js";

describe("npm-package-json-scripts-args", () => {
	const handler = handlers.find(({ name }) => name === "npm-package-json-scripts-args");
	assert(handler !== undefined);

	let testDir: string;
	let packageJsonPath: string;

	beforeEach(async () => {
		testDir = await mkdtemp(path.join(tmpdir(), "npm-package-json-scripts-args-test-"));
		packageJsonPath = path.join(testDir, "package.json");
	});

	afterEach(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	it("reports the current and preferred script lines and the auto-fix command", async () => {
		await writeFile(
			packageJsonPath,
			JSON.stringify({
				scripts: {
					semicolon: "echo hello;",
					"single-quotes": "echo 'hello world'",
				},
			}),
		);

		const result = await handler.handler(packageJsonPath, testDir);

		assert.equal(
			result,
			`${packageJsonPath} uses non-preferred argument quoting or escaping in the following scripts:
\tsemicolon:
\t\tCurrent:   echo hello;
\t\tPreferred: echo "hello;"
\tsingle-quotes:
\t\tCurrent:   echo 'hello world'
\t\tPreferred: echo "hello world"
Run \`pnpm flub check policy --fix --handler npm-package-json-scripts-args\` to fix these scripts automatically.`,
		);
	});
});

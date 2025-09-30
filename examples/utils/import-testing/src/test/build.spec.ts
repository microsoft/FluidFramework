/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { execFile } from "node:child_process";
import fs from "node:fs";
import { promisify } from "node:util";

const packageJson = fs.readFileSync("package.json");
const packageObj = JSON.parse(packageJson.toString()) as {
	devDependencies: Record<string, string>;
};
const devDependencies = packageObj.devDependencies;

const typescriptVersions = Object.entries(devDependencies).filter(([name]) =>
	name.startsWith("typescriptTest"),
);

const execFileAsync = promisify(execFile);

// Compile this package using several versions of typescript to ensure the type checking in its imports (mainly fluid-framework) passes.
describe("build tests", () => {
	for (const [name, version] of typescriptVersions) {
		it(`can import with ${name} (${version})`, async () => {
			const result = execFileAsync(
				`./node_modules/${name}/bin/tsc`,
				["--project", "./tsconfig.test.json", "--noEmit"],
				{},
			);

			try {
				await result;
			} catch (error) {
				throw new Error((error as Record<string, string>).stdout);
			}
		}).timeout(20000);
	}
});

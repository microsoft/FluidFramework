/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";
import { describe, it } from "mocha";
import {
	createNode10EntrypointFileContent,
	optionDefaults,
	readArgValues,
} from "../../../library/commands/generateEntrypoints.js";

describe("generateEntrypoints", () => {
	it("readArgValues", () => {
		expect(readArgValues("", optionDefaults)).to.deep.equal(optionDefaults);

		expect(
			readArgValues("--outFileLegacyBeta legacy --outDir ./dist", optionDefaults),
		).to.deep.equal({
			...optionDefaults,
			outDir: "./dist",
			outFileLegacyBeta: "legacy",
		});

		expect(readArgValues("--outDir ./lib", optionDefaults)).to.deep.equal({
			...optionDefaults,
			outDir: "./lib",
		});
	});

	it("generateNode10EntrypointFileContent", () => {
		// #region type-only

		expect(createNode10EntrypointFileContent("", "lib/legacy.d.ts", true)).to.contain(
			'export type * from "./lib/legacy.d.ts";\n',
		);

		// dirPath: sub directory
		expect(createNode10EntrypointFileContent("rollups", "lib/legacy.d.ts", true)).to.contain(
			'export type * from "../lib/legacy.d.ts";\n',
		);

		// dirPath: package root
		expect(createNode10EntrypointFileContent("", "lib/legacy/alpha.d.ts", true)).to.contain(
			'export type * from "./lib/legacy/alpha.d.ts";\n',
		);

		// #endregion

		// #region non-type-only

		expect(createNode10EntrypointFileContent("", "lib/legacy.d.ts", false)).to.contain(
			'export * from "./lib/legacy.js";\n',
		);

		// dirPath: sub directory
		expect(createNode10EntrypointFileContent("rollups", "lib/legacy.d.ts", false)).to.contain(
			'export * from "../lib/legacy.js";\n',
		);

		// sourceTypeRelPath: nested
		expect(createNode10EntrypointFileContent("", "lib/legacy/alpha.d.ts", false)).to.contain(
			'export * from "./lib/legacy/alpha.js";\n',
		);

		// #endregion
	});
});

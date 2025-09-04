/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";
import { describe, it } from "mocha";
import {
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
});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { performanceTestSuiteTag, userCategoriesSplitter } from "../../Configuration.js";
import { getName } from "../../mocha/mochaReporterUtilities.js";

describe("mochaReporterUtilities", () => {
	describe("getName", () => {
		it("strips the performance suite tag", () => {
			assert.equal(getName(`${performanceTestSuiteTag} My Test`), "My Test");
		});

		it("strips benchmark type tags", () => {
			assert.equal(getName("@Benchmark @Measurement My Test"), "My Test");
			assert.equal(getName("@Benchmark @Perspective My Test"), "My Test");
			assert.equal(getName("@Benchmark @Diagnostic My Test"), "My Test");
		});

		it("strips test type tags", () => {
			assert.equal(getName("@Benchmark @Measurement @MemoryUsage My Test"), "My Test");
			assert.equal(getName("@Benchmark @Measurement @ExecutionTime My Test"), "My Test");
		});

		it("strips the category splitter and everything after it", () => {
			assert.equal(
				getName(`@Benchmark @Measurement My Test ${userCategoriesSplitter} @myCategory`),
				"My Test",
			);
		});

		it("trims leading and trailing whitespace from the result", () => {
			assert.equal(getName("  plain name  "), "plain name");
		});

		it("returns empty string for a name that is only tags", () => {
			assert.equal(getName("@Benchmark @Measurement"), "");
		});
	});
});

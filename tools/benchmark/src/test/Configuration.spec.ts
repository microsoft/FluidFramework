/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	BenchmarkType,
	TestType,
	performanceTestSuiteTag,
	qualifiedTitle,
	userCategoriesSplitter,
} from "../Configuration.js";

describe("Configuration", () => {
	describe("qualifiedTitle", () => {
		it("defaults to Measurement benchmark type", () => {
			assert.equal(
				qualifiedTitle({ title: "my test" }),
				`${performanceTestSuiteTag} @Measurement my test`,
			);
		});

		it("uses the specified benchmark type", () => {
			assert.equal(
				qualifiedTitle({ title: "my test", type: BenchmarkType.Perspective }),
				`${performanceTestSuiteTag} @Perspective my test`,
			);
			assert.equal(
				qualifiedTitle({ title: "my test", type: BenchmarkType.Diagnostic }),
				`${performanceTestSuiteTag} @Diagnostic my test`,
			);
		});

		it("includes the test type tag when specified", () => {
			assert.equal(
				qualifiedTitle({ title: "my test", testType: TestType.MemoryUsage }),
				`${performanceTestSuiteTag} @Measurement @MemoryUsage my test`,
			);
			assert.equal(
				qualifiedTitle({ title: "my test", testType: TestType.ExecutionTime }),
				`${performanceTestSuiteTag} @Measurement @ExecutionTime my test`,
			);
		});

		it("appends category with splitter when a non-empty category is specified", () => {
			assert.equal(
				qualifiedTitle({ title: "my test", category: "myCategory" }),
				`${performanceTestSuiteTag} @Measurement my test ${userCategoriesSplitter} @myCategory`,
			);
		});

		it("omits category when category is an empty string", () => {
			assert.equal(
				qualifiedTitle({ title: "my test", category: "" }),
				`${performanceTestSuiteTag} @Measurement my test`,
			);
		});

		it("omits category when category is undefined", () => {
			assert.equal(
				qualifiedTitle({ title: "my test", category: undefined }),
				`${performanceTestSuiteTag} @Measurement my test`,
			);
		});
	});
});

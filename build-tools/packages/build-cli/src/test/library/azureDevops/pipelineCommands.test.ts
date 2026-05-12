/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "chai";
import { describe, it } from "mocha";

import {
	generateLogIssueString,
	generateSetVariableString,
} from "../../../library/azureDevops/pipelineCommands.js";

describe("azureDevops/pipelineCommands", () => {
	describe("generateSetVariableString", () => {
		it("formats a basic setvariable command", () => {
			assert.equal(
				generateSetVariableString("myVar", "hello"),
				"##vso[task.setvariable variable=myVar]hello",
			);
		});

		it("includes isOutput=true when requested", () => {
			assert.equal(
				generateSetVariableString("myVar", "hello", { isOutput: true }),
				"##vso[task.setvariable variable=myVar;isOutput=true]hello",
			);
		});

		it("escapes reserved characters in the value", () => {
			// `%` and CR/LF (but not `;` and `]`) must be escaped in the data portion.
			assert.equal(
				generateSetVariableString("myVar", "a;b]c%d\re\nf"),
				"##vso[task.setvariable variable=myVar]a;b]c%25d%0De%0Af",
			);
		});

		it("escapes reserved characters in the name", () => {
			assert.equal(
				generateSetVariableString("a;b]c%d\re\nf", "v"),
				"##vso[task.setvariable variable=a%3Bb%5Dc%25d%0De%0Af]v",
			);
		});

		it("escapes pnpm filter syntax safely in the value", () => {
			// pnpm filters can contain `...` and other punctuation; ensure they survive.
			const filter = "...{packages/foo}^...";
			assert.equal(
				generateSetVariableString("scopedPnpmFilter", filter, { isOutput: true }),
				`##vso[task.setvariable variable=scopedPnpmFilter;isOutput=true]${filter}`,
			);
		});
	});

	describe("generateLogIssueString", () => {
		it("formats a warning command", () => {
			assert.equal(
				generateLogIssueString("warning", "something happened"),
				"##vso[task.logissue type=warning]something happened",
			);
		});

		it("formats an error command", () => {
			assert.equal(
				generateLogIssueString("error", "boom"),
				"##vso[task.logissue type=error]boom",
			);
		});

		it("escapes reserved characters in the message", () => {
			assert.equal(
				generateLogIssueString("warning", "line1\nline2 with ] and % and \r"),
				"##vso[task.logissue type=warning]line1%0Aline2 with ] and %25 and %0D",
			);
		});
	});
});

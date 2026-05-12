/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "chai";
import { describe, it } from "mocha";

import {
	formatLogIssue,
	formatSetVariable,
} from "../../../library/azureDevops/pipelineCommands.js";

describe("azureDevops/pipelineCommands", () => {
	describe("formatSetVariable", () => {
		it("formats a basic setvariable command", () => {
			assert.equal(
				formatSetVariable("myVar", "hello"),
				"##vso[task.setvariable variable=myVar]hello",
			);
		});

		it("includes isOutput=true when requested", () => {
			assert.equal(
				formatSetVariable("myVar", "hello", { isOutput: true }),
				"##vso[task.setvariable variable=myVar;isOutput=true]hello",
			);
		});

		it("escapes reserved characters in the value", () => {
			// `;` and `]` and `%` and CR/LF must be escaped in the data portion.
			assert.equal(
				formatSetVariable("myVar", "a;b]c%d\re\nf"),
				"##vso[task.setvariable variable=myVar]a;b]c%25d%0De%0Af",
			);
		});

		it("escapes reserved characters in the name", () => {
			assert.equal(
				formatSetVariable("a;b]c%d\re\nf", "v"),
				"##vso[task.setvariable variable=a%3Bb%5Dc%25d%0De%0Af]v",
			);
		});

		it("escapes pnpm filter syntax safely in the value", () => {
			// pnpm filters can contain `...` and other punctuation; ensure they survive.
			const filter = "...{packages/foo}^...";
			assert.equal(
				formatSetVariable("scopedPnpmFilter", filter, { isOutput: true }),
				`##vso[task.setvariable variable=scopedPnpmFilter;isOutput=true]${filter}`,
			);
		});
	});

	describe("formatLogIssue", () => {
		it("formats a warning command", () => {
			assert.equal(
				formatLogIssue("warning", "something happened"),
				"##vso[task.logissue type=warning]something happened",
			);
		});

		it("formats an error command", () => {
			assert.equal(
				formatLogIssue("error", "boom"),
				"##vso[task.logissue type=error]boom",
			);
		});

		it("escapes reserved characters in the message", () => {
			assert.equal(
				formatLogIssue("warning", "line1\nline2 with ] and % and \r"),
				"##vso[task.logissue type=warning]line1%0Aline2 with ] and %25 and %0D",
			);
		});
	});
});

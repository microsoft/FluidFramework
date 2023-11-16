/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const { RuleTester } = require("eslint");
const noRestrictedTagsImports = require("../custom-rules/no-restricted-tags-imports");

const ruleTester = new RuleTester({
	parser: require.resolve("@typescript-eslint/parser"),
});

const validCodeWithJSDoc = `
/**
 * @public
 */
export function publicFunction() {}

import { publicFunction } from "./someModule";
`;

const validCode2WithJSDoc = `
/**
 * @internal
 */
export function internalExceptionFunction() {}

import { internalExceptionFunction } from "./foo";
`;

const invalidCodeWithJSDoc = `
/**
 * @internal
 */
export function internalFunction() {}

import { internalFunction } from "./internalModule";
`;

ruleTester.run("no-restricted-tags-imports", noRestrictedTagsImports, {
	// Checks cases that should pass
	valid: [
		{
			code: validCodeWithJSDoc,
			options: [
				{
					tags: ["@internal", "@alpha"],
				},
			],
		},
		{
			code: validCode2WithJSDoc,
			options: [
				{
					tags: ["@internal", "@alpha"],
					exceptions: ["./foo"],
				},
			],
		},
	],
	// Checks cases that should not pass
	invalid: [
		{
			code: invalidCodeWithJSDoc,
			options: [
				{
					tags: ["@internal", "@alpha"],
					exceptions: ["./foo", "bar"],
				},
			],
			errors: 1,
		},
	],
});

console.log("All tests passed!");

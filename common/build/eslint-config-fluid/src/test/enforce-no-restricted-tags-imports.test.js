/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const { RuleTester } = require("eslint");
const noRestrictedTagsImports = require("../custom-rules/no-restricted-tags-imports");

const ruleTester = new RuleTester({
	parser: require.resolve("@typescript-eslint/parser"),
	ecmaFeatures: {
		jsx: true,
	},
});

const validCodeWithJSDoc = `
/**
 * @public
 */
export function internalFunction() {}

import { internalFunction } from "./internalModule";
`;

const invalidCodeWithJSDoc = `
/**
 * @internal
 */
export function internalFunction() {}

import { internalFunction } from "./internalModule";
`;

ruleTester.run(
	"no-restricted-tags-imports", // rule name
	noRestrictedTagsImports, // rule code
	{
		// checks
		// 'valid' checks cases that should pass
		valid: [
			{
				code: validCodeWithJSDoc,
			},
		],
		// 'invalid' checks cases that should not pass
		invalid: [
			{
				code: invalidCodeWithJSDoc,
				options: [
					{
						tags: ["internal", "alpha"], // Array of tags
						exceptions: ["foo", "bar"], // Array of exceptions
					},
				],
				errors: 1,
			},
		],
	},
);

console.log("All tests passed!");

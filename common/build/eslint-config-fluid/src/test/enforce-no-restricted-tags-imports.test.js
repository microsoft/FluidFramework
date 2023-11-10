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
	"no-restricted-tags-imports",
	noRestrictedTagsImports,
	{
		// Checks cases that should pass
		valid: [
			{
				code: validCodeWithJSDoc,
			},
		],
		// 'Checks cases that should not pass
		invalid: [
			{
				code: invalidCodeWithJSDoc,
				options: [
					{
						tags: ["internal", "alpha"],
						exceptions: ["foo", "bar"], 
					},
				],
				errors: 1,
			},
		],
	},
);

console.log("All tests passed!");

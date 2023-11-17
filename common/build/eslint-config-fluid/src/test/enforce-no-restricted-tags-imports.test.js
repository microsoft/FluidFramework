/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const { RuleTester } = require("eslint");
const noRestrictedTagsImports = require("../custom-rules/no-restricted-tags-imports");

const ruleTester = new RuleTester({
	parser: require.resolve("@typescript-eslint/parser"),
});

const fileWithPublicFunction = `
/**
 * @public
 */
export function publicFunction() {}`;

const fileWithPublicImport = `
import { publicFunction } from "./someModule";
`;

const fileWithInternalImportException = `
import { internalExceptionFunction } from "./foo";
`;

const fileWithInternalTaggedFunction = `
/**
 * @internal
 */
export function internalFunction() {}
`;

const fileWithAlphaTaggedFunction = `
/**
 * @alpha
 */
export function alphaFunction() {}
`;

const fileWithInternalImport = `
import { internalFunction } from "./internalModule";
`;

const fileWithAlphaImport = `
import { AlphaFunction } from "./foo";
`;

ruleTester.run("no-restricted-tags-imports", noRestrictedTagsImports, {
	// Checks cases that should pass
	valid: [
		// Importing something with a non-restricted tag
		{
			code: fileWithPublicImport + fileWithPublicFunction,
			options: [
				{
					tags: ["@internal", "@alpha"],
				},
			],
		},
		// Restricted tag imported from exception
		{
			code: fileWithInternalImportException + fileWithInternalTaggedFunction,
			options: [
				{
					tags: ["@internal", "@alpha"],
					exceptions: { "@internal": ["./foo"] },
				},
			],
		},
	],
	// Checks cases that should not pass
	invalid: [
		// Import with restricted tag
		{
			code: fileWithInternalTaggedFunction + fileWithInternalImport,
			options: [
				{
					tags: ["@internal", "@alpha"],
				},
			],
			errors: 1,
		},
		// Invalid: tags should start with '@'
		{
			code: fileWithPublicFunction + fileWithPublicImport,
			options: [
				{
					tags: ["internal", "alpha"],
					exceptions: { "@internal": ["./foo"] },
				},
			],
			errors: 2,
		},
		// Invalid: Tag isn't excepted
		{
			code: fileWithAlphaTaggedFunction + fileWithAlphaImport,
			options: [
				{
					tags: ["@internal", "@alpha"],
					exceptions: { "@internal": ["./vfoo"] },
				},
			],
			errors: 1,
		},
		// Invalid: Tag excepted but wrong filepath
		{
			code: fileWithAlphaTaggedFunction + fileWithAlphaImport,
			options: [
				{
					tags: ["@internal", "@alpha"],
					exceptions: { "@alpha": ["./bar"] },
				},
			],
			errors: 1,
		},
	],
});

console.log("All tests passed!");

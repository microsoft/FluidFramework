/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [
		require.resolve("@fluidframework/eslint-config-fluid/minimal-deprecated"),
		"prettier",
	],
	parserOptions: {
		project: ["./src/test/tsconfig.json"],
	},
	rules: {
		"prefer-arrow-callback": "off",
		"@typescript-eslint/strict-boolean-expressions": "off", // requires strictNullChecks=true in tsconfig

		// This library is used in the browser, so we don't want dependencies on most node libraries.
		"import/no-nodejs-modules": ["error"],
		"@typescript-eslint/no-restricted-imports": [
			"error",
			{
				paths: [
					"@fluidframework/cell",
					"@fluidframework/counter",
					"@fluidframework/map",
					"@fluidframework/matrix",
					"@fluidframework/ordered-collection",
					"@fluidframework/register-collection",
					"@fluidframework/sequence",
					"@fluid-experimental/sequence-deprecated",
					"@fluidframework/aqueduct",
					"@fluidframework/datastore",
				].map((importName) => ({
					name: importName,
					message:
						"Rather than import this Fluid package directly, use the 'apis' argument of describeCompat. See \"How-to\" in the README for more information.",
					allowTypeImports: true,
				})),
			},
		],

		/*
			This rule causes the following errors, so is temporarily disabled.

			@fluid-private/test-end-to-end-tests: Error: Circularity detected while resolving configuration: /home/tylerbu/code/release-1/common/build/build-common/tsconfig.base.json
			@fluid-private/test-end-to-end-tests: Occurred while linting /home/tylerbu/code/release-1/packages/test/test-end-to-end-tests/src/mocking.ts:6
			@fluid-private/test-end-to-end-tests: Rule: "import/no-deprecated"
			@fluid-private/test-end-to-end-tests:     at Be (/home/tylerbu/code/release-1/node_modules/.pnpm/get-tsconfig@4.7.2/node_modules/get-tsconfig/dist/index.cjs:3:9255)
			@fluid-private/test-end-to-end-tests:     at ie (/home/tylerbu/code/release-1/node_modules/.pnpm/get-tsconfig@4.7.2/node_modules/get-tsconfig/dist/index.cjs:3:10245)
			@fluid-private/test-end-to-end-tests:     at Be (/home/tylerbu/code/release-1/node_modules/.pnpm/get-tsconfig@4.7.2/node_modules/get-tsconfig/dist/index.cjs:3:9365)
			@fluid-private/test-end-to-end-tests:     at ie (/home/tylerbu/code/release-1/node_modules/.pnpm/get-tsconfig@4.7.2/node_modules/get-tsconfig/dist/index.cjs:3:10245)
			@fluid-private/test-end-to-end-tests:     at le (/home/tylerbu/code/release-1/node_modules/.pnpm/get-tsconfig@4.7.2/node_modules/get-tsconfig/dist/index.cjs:3:10975)
			@fluid-private/test-end-to-end-tests:     at Le (/home/tylerbu/code/release-1/node_modules/.pnpm/get-tsconfig@4.7.2/node_modules/get-tsconfig/dist/index.cjs:3:11080)
			@fluid-private/test-end-to-end-tests:     at isEsModuleInterop (/home/tylerbu/code/release-1/node_modules/.pnpm/eslint-plugin-i@2.29.0_j7h7oj6rrhtikhzta4fgkou42e/node_modules/eslint-plugin-i/lib/ExportMap.js:809:1291)
			@fluid-private/test-end-to-end-tests:     at ExportMap.parse (/home/tylerbu/code/release-1/node_modules/.pnpm/eslint-plugin-i@2.29.0_j7h7oj6rrhtikhzta4fgkou42e/node_modules/eslint-plugin-i/lib/ExportMap.js:799:317)
			@fluid-private/test-end-to-end-tests:     at ExportMap.for (/home/tylerbu/code/release-1/node_modules/.pnpm/eslint-plugin-i@2.29.0_j7h7oj6rrhtikhzta4fgkou42e/node_modules/eslint-plugin-i/lib/ExportMap.js:798:201)
			@fluid-private/test-end-to-end-tests:     at ExportMap.get (/home/tylerbu/code/release-1/node_modules/.pnpm/eslint-plugin-i@2.29.0_j7h7oj6rrhtikhzta4fgkou42e/node_modules/eslint-plugin-i/lib/ExportMap.js:792:465)
		 */
		"import/no-deprecated": "off",
	},
	overrides: [
		{
			// Rules only for test files
			files: ["*.spec.ts", "src/test/**"],
			rules: {
				// Test files are run in node only so additional node libraries can be used.
				"import/no-nodejs-modules": ["error", { allow: ["assert"] }],
			},
		},
		{
			files: ["src/test/benchmark/**"],
			rules: {
				// General guidance to avoid importing compat-provided APIs does not apply to the benchmark tests,
				// since they don't currently aim to test performance of mixed-versioned packages or cross-version
				// collaboration between clients.
				"@typescript-eslint/no-restricted-imports": "off",
			},
		},
	],
};

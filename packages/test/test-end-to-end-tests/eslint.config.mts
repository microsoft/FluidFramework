/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";

import { minimalDeprecated } from "../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...minimalDeprecated,
	{
		rules: {
			"@fluid-internal/fluid/no-unchecked-record-access": "warn",
			"@typescript-eslint/explicit-function-return-type": "warn",
			"@typescript-eslint/strict-boolean-expressions": "off",
			"prefer-arrow-callback": "off",
			"import-x/no-nodejs-modules": ["error"],
			"@typescript-eslint/no-restricted-imports": [
				"error",
				{
					"paths": [
						{
							"name": "@fluidframework/cell",
							"message":
								"Rather than import this Fluid package directly, use the 'apis' argument of describeCompat. See \"How-to\" in the README for more information.",
							"allowTypeImports": true,
						},
						{
							"name": "@fluidframework/counter",
							"message":
								"Rather than import this Fluid package directly, use the 'apis' argument of describeCompat. See \"How-to\" in the README for more information.",
							"allowTypeImports": true,
						},
						{
							"name": "@fluidframework/map",
							"message":
								"Rather than import this Fluid package directly, use the 'apis' argument of describeCompat. See \"How-to\" in the README for more information.",
							"allowTypeImports": true,
						},
						{
							"name": "@fluidframework/matrix",
							"message":
								"Rather than import this Fluid package directly, use the 'apis' argument of describeCompat. See \"How-to\" in the README for more information.",
							"allowTypeImports": true,
						},
						{
							"name": "@fluidframework/ordered-collection",
							"message":
								"Rather than import this Fluid package directly, use the 'apis' argument of describeCompat. See \"How-to\" in the README for more information.",
							"allowTypeImports": true,
						},
						{
							"name": "@fluidframework/register-collection",
							"message":
								"Rather than import this Fluid package directly, use the 'apis' argument of describeCompat. See \"How-to\" in the README for more information.",
							"allowTypeImports": true,
						},
						{
							"name": "@fluidframework/sequence",
							"message":
								"Rather than import this Fluid package directly, use the 'apis' argument of describeCompat. See \"How-to\" in the README for more information.",
							"allowTypeImports": true,
						},
						{
							"name": "@fluid-experimental/sequence-deprecated",
							"message":
								"Rather than import this Fluid package directly, use the 'apis' argument of describeCompat. See \"How-to\" in the README for more information.",
							"allowTypeImports": true,
						},
						{
							"name": "@fluidframework/aqueduct",
							"message":
								"Rather than import this Fluid package directly, use the 'apis' argument of describeCompat. See \"How-to\" in the README for more information.",
							"allowTypeImports": true,
						},
						{
							"name": "@fluidframework/datastore",
							"message":
								"Rather than import this Fluid package directly, use the 'apis' argument of describeCompat. See \"How-to\" in the README for more information.",
							"allowTypeImports": true,
						},
					],
				},
			],
			"import-x/no-deprecated": "off",
		},
	},
	{
		files: ["*.spec.ts", "src/test/**"],
		rules: {
			"import-x/no-nodejs-modules": [
				"error",
				{
					"allow": ["assert"],
				},
			],
		},
	},
	{
		files: ["src/test/benchmark/**"],
		rules: {
			"@typescript-eslint/no-restricted-imports": "off",
		},
	},
	{
		// Override @typescript-eslint/parser to use explicit project list instead of projectService.
		// This is a test-only package without a root tsconfig.json, so typescript-eslint's
		// projectService can't auto-discover the project configuration.
		files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
		languageOptions: {
			parserOptions: {
				projectService: false,
				project: ["./src/test/tsconfig.json"],
			},
		},
	},
];

export default config;

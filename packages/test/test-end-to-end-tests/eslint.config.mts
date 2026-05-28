/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Linter } from "eslint";
import { recommended } from "@fluidframework/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...recommended,
	{
		rules: {
			"@fluid-internal/fluid/no-unchecked-record-access": "warn",
			"@typescript-eslint/explicit-function-return-type": "warn",
			"@typescript-eslint/explicit-module-boundary-types": "off",
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-restricted-imports": [
				"error",
				{
					// All entries use `patterns` (rather than `paths`) so each rule covers both the
					// public entrypoint and the `/internal` entrypoint (which is what most tests
					// actually import from). Test directories that legitimately need direct imports
					// (benchmark/, migration-shim/) are exempted via file-pattern overrides below.
					"patterns": [
						// --- Blanket restrictions ---
						// All value exports from these packages are compat-versioned via apis.dds.*
						// (or apis.dataRuntime.packages.*), so any value import from them should
						// go through `apis` rather than being imported directly.
						{
							"group": ["@fluidframework/cell", "@fluidframework/cell/*"],
							"message":
								"Rather than import this Fluid package directly, use the 'apis' argument of describeCompat. See \"How-to\" in the README for more information.",
							"allowTypeImports": true,
						},
						{
							"group": ["@fluidframework/counter", "@fluidframework/counter/*"],
							"message":
								"Rather than import this Fluid package directly, use the 'apis' argument of describeCompat. See \"How-to\" in the README for more information.",
							"allowTypeImports": true,
						},
						{
							"group": ["@fluidframework/map", "@fluidframework/map/*"],
							"message":
								"Rather than import this Fluid package directly, use the 'apis' argument of describeCompat. See \"How-to\" in the README for more information.",
							"allowTypeImports": true,
						},
						{
							"group": ["@fluidframework/matrix", "@fluidframework/matrix/*"],
							"message":
								"Rather than import this Fluid package directly, use the 'apis' argument of describeCompat. See \"How-to\" in the README for more information.",
							"allowTypeImports": true,
						},
						{
							"group": [
								"@fluidframework/ordered-collection",
								"@fluidframework/ordered-collection/*",
							],
							"message":
								"Rather than import this Fluid package directly, use the 'apis' argument of describeCompat. See \"How-to\" in the README for more information.",
							"allowTypeImports": true,
						},
						{
							"group": [
								"@fluidframework/register-collection",
								"@fluidframework/register-collection/*",
							],
							"message":
								"Rather than import this Fluid package directly, use the 'apis' argument of describeCompat. See \"How-to\" in the README for more information.",
							"allowTypeImports": true,
						},
						{
							"group": ["@fluidframework/sequence", "@fluidframework/sequence/*"],
							"message":
								"Rather than import this Fluid package directly, use the 'apis' argument of describeCompat. See \"How-to\" in the README for more information.",
							"allowTypeImports": true,
						},
						{
							"group": [
								"@fluid-experimental/sequence-deprecated",
								"@fluid-experimental/sequence-deprecated/*",
							],
							"message":
								"Rather than import this Fluid package directly, use the 'apis' argument of describeCompat. See \"How-to\" in the README for more information.",
							"allowTypeImports": true,
						},
						{
							"group": ["@fluidframework/datastore", "@fluidframework/datastore/*"],
							"message":
								"Rather than import this Fluid package directly, use the 'apis' argument of describeCompat. See \"How-to\" in the README for more information.",
							"allowTypeImports": true,
						},
						// --- Targeted restrictions ---
						// Only a subset of these packages' exports are compat-versioned; other
						// exports remain valid for direct import.
						{
							"group": ["@fluidframework/aqueduct", "@fluidframework/aqueduct/*"],
							"importNames": [
								"BaseContainerRuntimeFactory",
								"ContainerRuntimeFactoryWithDefaultDataStore",
								"DataObject",
								"DataObjectFactory",
							],
							"message":
								"Use apis.dataRuntime.{DataObject,DataObjectFactory} / apis.containerRuntime.{BaseContainerRuntimeFactory,ContainerRuntimeFactoryWithDefaultDataStore} from describeCompat instead. Other aqueduct exports (e.g. TreeDataObject) are not compat-versioned and remain unrestricted.",
							"allowTypeImports": true,
						},
						{
							"group": [
								"@fluidframework/container-loader",
								"@fluidframework/container-loader/*",
							],
							"importNames": ["Loader"],
							"message":
								"Use apis.loader.Loader from describeCompat instead. Other container-loader exports (ConnectionState, LoaderHeader, ILoaderProps, waitContainerToCatchUp, etc.) are not compat-versioned and remain unrestricted.",
							"allowTypeImports": true,
						},
						{
							"group": [
								"@fluidframework/container-runtime",
								"@fluidframework/container-runtime/*",
							],
							"importNames": ["ContainerRuntime"],
							"message":
								"Use apis.containerRuntime.ContainerRuntime from describeCompat instead. Other container-runtime exports (IContainerRuntimeOptions, CompressionAlgorithms, DefaultSummaryConfiguration, ContainerMessageType, IGCRuntimeOptions, ISummarizer, etc.) are not compat-versioned and remain unrestricted.",
							"allowTypeImports": true,
						},
						{
							"group": ["@fluidframework/tree", "@fluidframework/tree/*"],
							"importNames": [
								"SchemaFactory",
								"SharedTree",
								"TreeViewConfiguration",
								"configuredSharedTree",
							],
							"message":
								"Use apis.dds.SharedTree / apis.dataRuntime.packages.tree.{SchemaFactory,TreeViewConfiguration,configuredSharedTree} from describeCompat instead. Tree type exports (ITree, TreeView, ITreeAlpha, etc.) are not affected.",
							"allowTypeImports": true,
						},
					],
				},
			],
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
			"import-x/no-nodejs-modules": ["error"],
			"no-void": "off",
			"prefer-arrow-callback": "off",
			"require-atomic-updates": "off",
			"unicorn/catch-error-name": "off",
			"unicorn/explicit-length-check": "off",
			"unicorn/new-for-builtins": "off",
			"unicorn/no-array-for-each": "off",
			"unicorn/no-await-expression-member": "off",
			"unicorn/no-await-in-promise-methods": "off",
			"unicorn/no-lonely-if": "off",
			"unicorn/no-negated-condition": "off",
			"unicorn/no-new-array": "off",
			"unicorn/no-null": "off",
			"unicorn/no-unnecessary-await": "off",
			"unicorn/no-useless-promise-resolve-reject": "off",
			"unicorn/no-zero-fractions": "off",
			"unicorn/prefer-node-protocol": "off",
			"unicorn/prefer-optional-catch-binding": "off",
			"unicorn/prefer-set-has": "off",
			"unicorn/prefer-spread": "off",
			"unicorn/switch-case-braces": "off",
			"unicorn/text-encoding-identifier-case": "off",
			"unicorn/throw-new-error": "off",
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
		// Migration-shim tests intentionally target the current new SharedTree (the migration
		// destination), so they import directly rather than via apis (which would substitute an
		// older version under compat configs).
		files: ["src/test/migration-shim/**"],
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

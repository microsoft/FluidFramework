/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts
 */
import { strict } from "../../../common/build/eslint-config-fluid/flat.mjs";

/** @type {import("eslint").Linter.Config[]} */
const config = [
	...strict,
	{
		rules: {
			"import-x/no-internal-modules": [
				"error",
				{
					"allow": [
						"@fluidframework/*/alpha",
						"@fluidframework/*/beta",
						"@fluidframework/*/legacy",
						"@fluidframework/*/internal",
					],
				},
			],
		},
	},
	{
		files: ["src/test/**/*"],
		rules: {
			"import-x/no-internal-modules": [
				"error",
				{
					"allow": [
						"*/index.js",
						"@fluidframework/*/alpha",
						"@fluidframework/*/beta",
						"@fluidframework/*/legacy",
						"@fluidframework/*/internal",
					],
				},
			],
		},
	},
	{
		files: ["src/test/**", "*.spec.ts", "*.test.ts"],
		languageOptions: {
			parserOptions: {
				projectService: false,
				project: ["./tsconfig.json"],
			},
		},
	},
];

export default config;

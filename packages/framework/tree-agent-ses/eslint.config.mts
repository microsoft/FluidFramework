/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts --typescript
 */
import type { Linter } from "eslint";
import { strict } from "../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
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
		languageOptions: {
			parserOptions: {
				projectService: false,
				project: ["./src/test/tsconfig.json"],
			},
		},
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
			"import-x/no-unresolved": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
		},
	},
];

export default config;

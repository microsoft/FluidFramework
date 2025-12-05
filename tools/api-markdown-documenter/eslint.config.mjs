/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts
 */
import { strict } from "../../common/build/eslint-config-fluid/flat.mjs";

/** @type {import("eslint").Linter.Config[]} */
const config = [
	...strict,
	{
		rules: {
			"@fluid-internal/fluid/no-unchecked-record-access": "off",
			"@typescript-eslint/class-literal-property-style": "off",
			"@typescript-eslint/no-unsafe-enum-comparison": "off",
			"unicorn/prevent-abbreviations": [
				"error",
				{
					"allowList": {
						"i": true,
					},
				},
			],
			"unicorn/prefer-module": "off",
			"unicorn/prefer-negative-index": "off",
			"import-x/no-nodejs-modules": "off",
		},
	},
	{
		files: ["src/**/test/**"],
		rules: {
			"import-x/no-extraneous-dependencies": [
				"error",
				{
					"devDependencies": true,
				},
			],
			"@typescript-eslint/no-unused-expressions": "off",
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

/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts --typescript
 */
import type { Linter } from "eslint";
import { recommended } from "../../../common/build/eslint-config-fluid/flat.mts";
import sharedConfig from "../../eslint.config.data.mts";

const config: Linter.Config[] = [
	...recommended,
	...sharedConfig,
	{
		rules: {
			"import-x/no-internal-modules": [
				"error",
				{
					"allow": [
						"@fluidframework/*/beta",
						"@fluidframework/*/alpha",
						"next/**",
						"@/actions/**",
						"@/types/**",
						"@/infra/**",
						"@/components/**",
						"@/app/**",
						"@fluidframework/ai-collab/alpha",
					],
				},
			],
			"import-x/no-extraneous-dependencies": [
				"error",
				{
					"devDependencies": true,
				},
			],
		},
	},
	{
		files: ["src/actions/task.ts"],
		rules: {
			"import-x/no-nodejs-modules": [
				"error",
				{
					"allow": ["node:fs", "node:path", "node:url"],
				},
			],
		},
	},
	{
		files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
		languageOptions: {
			parserOptions: {
				projectService: false,
				project: ["./tsconfig.json"],
			},
		},
	},
];

export default config;

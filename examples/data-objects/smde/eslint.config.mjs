/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts
 */
import { minimalDeprecated } from "../../../common/build/eslint-config-fluid/flat.mjs";

/** @type {import("eslint").Linter.Config[]} */
const config = [
	...minimalDeprecated,
	{
		rules: {
			"import-x/no-extraneous-dependencies": [
				"error",
				{
					"devDependencies": true,
				},
			],
		},
	},
	// Migrated from .eslintignore
	{
		ignores: ["*.spec.ts"],
	},
];

export default config;

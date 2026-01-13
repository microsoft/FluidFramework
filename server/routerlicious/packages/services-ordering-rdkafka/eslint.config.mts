/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts --typescript
 */
import type { Linter } from "eslint";
import { minimalDeprecated } from "../../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...minimalDeprecated,
	{
		rules: {
			"promise/catch-or-return": [
				"error",
				{
					allowFinally: true,
				},
			],
			"@typescript-eslint/prefer-nullish-coalescing": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
			"import-x/no-deprecated": "warn",
			"import-x/no-nodejs-modules": "off",
			"@typescript-eslint/no-unsafe-return": "off",
		},
	},
	// Migrated from .eslintignore
	{
		ignores: ["*.spec.ts"],
	},
];

export default config;

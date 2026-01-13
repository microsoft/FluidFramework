/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts --typescript
 */
import type { Linter } from "eslint";
import { recommended } from "../../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...recommended,
	{
		rules: {
			"promise/catch-or-return": [
				"error",
				{
					allowFinally: true,
				},
			],
			"@typescript-eslint/prefer-nullish-coalescing": "off",
		},
	},
	// Migrated from .eslintignore
	{
		ignores: ["*.spec.ts"],
	},
];

export default config;

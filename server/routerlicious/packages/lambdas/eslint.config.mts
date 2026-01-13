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
			"@rushstack/no-new-null": "off",
			"import-x/no-nodejs-modules": "off",
			"promise/catch-or-return": [
				"error",
				{
					allowFinally: true,
				},
			],
			"unicorn/no-null": "off",
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/restrict-template-expressions": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
			"unicorn/prefer-node-protocol": "off",
			"unicorn/text-encoding-identifier-case": "off",
			"@typescript-eslint/prefer-nullish-coalescing": "off",
			"import-x/no-deprecated": "warn",
			"@fluid-internal/fluid/no-unchecked-record-access": "warn",
		},
	},
	// Migrated from .eslintignore
	{
		ignores: ["*.generated.ts", "*.spec.ts"],
	},
];

export default config;

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
			"@typescript-eslint/consistent-type-assertions": "off",
			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/no-use-before-define": "off",
			"import-x/no-nodejs-modules": "off",
			"no-case-declarations": "off",
			"promise/catch-or-return": ["error", {
				"allowFinally": true,
			}],
			"@typescript-eslint/prefer-nullish-coalescing": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
			"import-x/no-deprecated": "warn",
			"@fluid-internal/fluid/no-unchecked-record-access": "warn",
		},
	},
];

export default config;

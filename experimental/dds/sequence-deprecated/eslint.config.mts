/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts --typescript
 */
import type { Linter } from "eslint";
import { minimalDeprecated } from "../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...minimalDeprecated,
	{
		rules: {
			"import-x/no-deprecated": "off",
			"@typescript-eslint/no-use-before-define": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
		},
	},
];

export default config;

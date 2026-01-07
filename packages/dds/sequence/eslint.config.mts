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
			// #region TODO: Fix violations and remove these rule disables

			"@fluid-internal/fluid/no-unchecked-record-access": "warn",

			"@typescript-eslint/explicit-function-return-type": "warn",
			"@typescript-eslint/no-use-before-define": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",

			"prefer-arrow-callback": "off",

			// #endregion
		},
	},
];

export default config;

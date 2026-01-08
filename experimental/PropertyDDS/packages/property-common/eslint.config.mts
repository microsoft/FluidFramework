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
			"@typescript-eslint/explicit-function-return-type": "warn",
			"@fluid-internal/fluid/no-unchecked-record-access": "warn",
			"prefer-arrow-callback": "off",
			"tsdoc/syntax": "off",
			"depend/ban-dependencies": [
				"error",
				{
					"allowed": ["lodash"],
				},
			],
		},
	},
];

export default config;

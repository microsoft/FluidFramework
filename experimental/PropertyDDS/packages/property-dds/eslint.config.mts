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
			"@typescript-eslint/strict-boolean-expressions": "off",
			"tsdoc/syntax": "off",
			"@fluid-internal/fluid/no-unchecked-record-access": "warn",
			"depend/ban-dependencies": [
				"error",
				{
					"allowed": ["axios", "lodash"],
				},
			],
		},
	},
];

export default config;

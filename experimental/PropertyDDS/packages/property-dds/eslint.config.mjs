/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts
 */
import { strict } from "../../../../common/build/eslint-config-fluid/flat.mjs";

const config = [
	...strict,
	{
		rules: {
			"@typescript-eslint/strict-boolean-expressions": "off",
			"tsdoc/syntax": "off",
			"@fluid-internal/fluid/no-unchecked-record-access": "warn",
		},
	},
];

export default config;

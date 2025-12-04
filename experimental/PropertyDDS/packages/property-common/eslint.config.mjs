/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts
 */
import { minimalDeprecated } from '../../../../common/build/eslint-config-fluid/flat.mjs';

const config = [
	...minimalDeprecated,
	{
		rules: {
		  "@fluid-internal/fluid/no-unchecked-record-access": "warn",
		  "prefer-arrow-callback": "off",
		  "tsdoc/syntax": "off"
		},
	},
];

export default config;

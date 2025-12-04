/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts
 */
import { recommended } from '../../../common/build/eslint-config-fluid/flat.mjs';

const config = [
	...recommended,
	{
		rules: {
		  "@fluid-internal/fluid/no-unchecked-record-access": "warn"
		},
	},
];

export default config;

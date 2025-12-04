/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts
 */
import { recommended } from '../../../../common/build/eslint-config-fluid/flat.mjs';

const config = [
	...recommended,
	{
		rules: {
		  "promise/catch-or-return": [
		    "error",
		    {
		      "allowFinally": true
		    }
		  ],
		  "@typescript-eslint/prefer-nullish-coalescing": "off"
		},
	},
];

export default config;

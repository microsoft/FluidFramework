/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts
 */
import { strict } from '../../../common/build/eslint-config-fluid/flat.mjs';

const config = [
	...strict,
	{
		rules: {
		  "unicorn/prevent-abbreviations": [
		    "error",
		    {
		      "allowList": {
		        "i": true
		      },
		      "ignore": [
		        "[pP]rops"
		      ]
		    }
		  ]
		},
	},
	{
		files: ["src/test/types/*"],
		rules: {
		  "unicorn/prevent-abbreviations": "off"
		},
	},
	{
		files: ["src/test/*.spec.ts"],
		rules: {
		  "prefer-arrow-callback": "off"
		},
	},
];

export default config;

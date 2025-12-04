/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts
 */
import { minimalDeprecated } from '../../../common/build/eslint-config-fluid/flat.mjs';

const config = [
	...minimalDeprecated,
	{
		rules: {
		  "import-x/no-nodejs-modules": [
		    "error"
		  ],
		  "@fluid-internal/fluid/no-unchecked-record-access": "warn",
		  "@typescript-eslint/unbound-method": "off"
		},
	},
	{
		files: ["*.spec.ts","src/test/**"],
		rules: {
		  "import-x/no-nodejs-modules": "off"
		},
	},
];

export default config;

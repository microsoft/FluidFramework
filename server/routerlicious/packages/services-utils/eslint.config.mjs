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
		  "import-x/no-nodejs-modules": "off",
		  "promise/catch-or-return": [
		    "error",
		    {
		      "allowFinally": true
		    }
		  ],
		  "import-x/no-deprecated": "warn",
		  "@fluid-internal/fluid/no-unchecked-record-access": "warn"
		},
	},
	{
		files: ["**/*.{ts,tsx}"],
		ignores: ["**/src/test/**", "**/tests/**", "**/*.spec.ts", "**/*.test.ts"],
		rules: {
		  "@typescript-eslint/strict-boolean-expressions": "warn"
		},
	},
];

export default config;

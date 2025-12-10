/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts --typescript
 */
import type { Linter } from "eslint";
import { minimalDeprecated } from "../../../common/build/eslint-config-fluid/flat.mts";
import sharedConfig, {
	importInternalModulesAllowed,
	importInternalModulesAllowedForTest,
} from "../../eslint.config.data.mts";

const config: Linter.Config[] = [
	...minimalDeprecated,
	...sharedConfig,
	{
		rules: {
			"@typescript-eslint/no-use-before-define": "off",
			"@typescript-eslint/prefer-nullish-coalescing": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
			"import-x/no-internal-modules": [
				"error",
				{
					"allow": [...importInternalModulesAllowed, "*/*.js"],
				},
			],
			"max-len": "off",
			"no-bitwise": "off",
			"no-case-declarations": "off",
			"@typescript-eslint/unbound-method": "off",
		},
	},
	{
		files: ["*.spec.ts", "src/test/**"],
		rules: {
			"import-x/no-internal-modules": [
				"error",
				{
					"allow": [...importInternalModulesAllowedForTest],
				},
			],
		},
	},
];

export default config;

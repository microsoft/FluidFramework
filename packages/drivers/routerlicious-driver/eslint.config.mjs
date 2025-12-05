/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts
 */
import { minimalDeprecated } from "../../../common/build/eslint-config-fluid/flat.mjs";

/** @type {import("eslint").Linter.Config[]} */
const config = [
	...minimalDeprecated,
	{
		rules: {
			"@typescript-eslint/no-non-null-assertion": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
			"no-case-declarations": "off",
			"@fluid-internal/fluid/no-unchecked-record-access": "warn",
			"@typescript-eslint/unbound-method": "off",
		},
	},
];

export default config;

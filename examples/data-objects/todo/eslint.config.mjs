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
			"@fluid-internal/fluid/no-unchecked-record-access": "warn",
		},
	},
];

export default config;

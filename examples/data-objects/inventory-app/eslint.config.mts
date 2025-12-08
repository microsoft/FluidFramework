/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts --typescript
 */
import type { Linter } from "eslint";
import { recommended } from "../../../common/build/eslint-config-fluid/flat.mts";
import sharedConfig from "../../eslint.config.data.mts";

const config: Linter.Config[] = [
	...recommended,
	...sharedConfig,
	{
		files: ["**/*.jsx", "**/*.tsx"],
		rules: {
			"react/no-deprecated": "off",
			"react-hooks/exhaustive-deps": ["error"],
			"react-hooks/rules-of-hooks": "error",
			"react/jsx-key": [
				"error",
				{
					"checkFragmentShorthand": true,
					"checkKeyMustBeforeSpread": true,
					"warnOnDuplicates": true,
				},
			],
			"react/jsx-boolean-value": ["error", "always"],
			"react/jsx-fragments": "error",
			"react/no-string-refs": "error",
			"react/no-unstable-nested-components": [
				"error",
				{
					"allowAsProps": true,
				},
			],
			"react/self-closing-comp": "error",
			"react/jsx-no-target-blank": "error",
			"react/jsx-no-useless-fragment": [
				"error",
				{
					"allowExpressions": true,
				},
			],
			"react/prop-types": "off",
		},
	},
];

export default config;

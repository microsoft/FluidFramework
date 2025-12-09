/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts --typescript
 */
import type { Linter } from "eslint";
import { minimalDeprecated } from "../../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...minimalDeprecated,
	{
		rules: {
			"@typescript-eslint/ban-ts-comment": "off",
			"@typescript-eslint/consistent-type-definitions": "off",
			"@typescript-eslint/dot-notation": "off",
			"@typescript-eslint/no-dynamic-delete": "off",
			"@typescript-eslint/no-invalid-this": "off",
			"@typescript-eslint/no-empty-interface": "off",
			"@typescript-eslint/no-empty-object-type": "off",
			"@typescript-eslint/no-non-null-assertion": "off",
			"@typescript-eslint/no-require-imports": "off",
			"@typescript-eslint/no-shadow": "off",
			"@typescript-eslint/no-this-alias": "off",
			"@typescript-eslint/no-unnecessary-qualifier": "off",
			"@typescript-eslint/no-unnecessary-type-assertion": "off",
			"@typescript-eslint/no-unsafe-function-type": "off",
			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/no-unused-expressions": "off",
			"@typescript-eslint/no-var-requires": "off",
			"@typescript-eslint/prefer-for-of": "off",
			"@typescript-eslint/prefer-includes": "off",
			"@typescript-eslint/prefer-nullish-coalescing": "off",
			"@typescript-eslint/prefer-optional-chain": "off",
			"@typescript-eslint/prefer-readonly": "off",
			"@typescript-eslint/restrict-plus-operands": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
			"@typescript-eslint/unbound-method": "off",
			"eqeqeq": "off",
			"import-x/no-internal-modules": "off",
			"no-case-declarations": "off",
			"no-inner-declarations": "off",
			"no-multi-spaces": "off",
			"no-param-reassign": "off",
			"no-prototype-builtins": "off",
			"no-useless-escape": "off",
			"no-var": "off",
			"prefer-arrow-callback": "off",
			"prefer-const": "off",
			"prefer-template": "off",
			"quote-props": "off",
			"tsdoc/syntax": "off",
			"unicorn/better-regex": "off",
			"unicorn/filename-case": "off",
			"depend/ban-dependencies": [
				"error",
				{
					"allowed": ["lodash", "traverse"],
				},
			],
			"@fluid-internal/fluid/no-unchecked-record-access": "warn",
		},
	},
];

export default config;

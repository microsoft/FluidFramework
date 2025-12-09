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
			"@typescript-eslint/dot-notation": "off",
			"@typescript-eslint/no-dynamic-delete": "off",
			"@typescript-eslint/no-extraneous-class": "off",
			"@typescript-eslint/no-implied-eval": "off",
			"@typescript-eslint/no-invalid-this": "off",
			"@typescript-eslint/no-require-imports": "off",
			"@typescript-eslint/no-shadow": "off",
			"@typescript-eslint/no-this-alias": "off",
			"@typescript-eslint/no-unnecessary-type-assertion": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/no-unused-expressions": "off",
			"@typescript-eslint/no-var-requires": "off",
			"@typescript-eslint/prefer-for-of": "off",
			"@typescript-eslint/prefer-nullish-coalescing": "off",
			"@typescript-eslint/prefer-optional-chain": "off",
			"@typescript-eslint/restrict-plus-operands": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
			"@typescript-eslint/unbound-method": "off",
			"guard-for-in": "off",
			"import-x/no-duplicates": "off",
			"import-x/no-extraneous-dependencies": "off",
			"import-x/no-internal-modules": "off",
			"max-len": "off",
			"no-bitwise": "off",
			"no-new-func": "off",
			"no-param-reassign": "off",
			"no-prototype-builtins": "off",
			"no-undef": "off",
			"no-undef-init": "off",
			"no-var": "off",
			"object-shorthand": "off",
			"one-var": "off",
			"prefer-arrow-callback": "off",
			"prefer-const": "off",
			"prefer-object-spread": "off",
			"prefer-template": "off",
			"quote-props": "off",
			"tsdoc/syntax": "off",
			"unicorn/better-regex": "off",
			"depend/ban-dependencies": [
				"error",
				{
					"allowed": ["lodash", "underscore"],
				},
			],
			"@fluid-internal/fluid/no-unchecked-record-access": "warn",
		},
	},
	// Migrated from .eslintignore
	{
		ignores: ["src/index.d.ts"],
	},
];

export default config;

// This module contains rule details to be shared between the config variants exposed by this package.
module.exports = {
	/**
	 * Shared base rule details for `@typescript-eslint/naming-convention` rule.
	 *
	 * @see {@link https://typescript-eslint.io/rules/naming-convention/}
	 */
	namingConventionRules: [
		{
			selector: "default",
			format: ["camelCase", "PascalCase"],
			leadingUnderscore: "forbid", // We have no global convention for trailing underscores
			trailingUnderscore: "forbid", // We have no global convention for trailing underscores
		},
		{
			selector: "accessor",
			modifiers: ["private"],
			format: ["camelCase"],
			leadingUnderscore: "allow",
		},
		{
			selector: "variable",
			format: ["camelCase", "PascalCase"], // PascalCase required for cases where we use variables like classes.
			leadingUnderscore: "allow", // Allowed to avoid shadowing existing properties / variables in some cases
		},
		{
			selector: ["typeLike", "class"],
			format: ["PascalCase"],
		},
		{
			selector: "typeParameter",
			format: ["PascalCase"],
			// Require "T" prefix for type parameters.
			custom: {
				regex: "^T[A-Z]",
				match: true,
			},
		},
	],
};

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
			format: ["camelCase", "PascalCase"], // "camelCase" and "PascalCase" are the only formats we prescribe.
			leadingUnderscore: "forbid", // We have no global convention for leading underscores
			trailingUnderscore: "forbid", // We have no global convention for trailing underscores
		},
		{
			selector: ["accessor", "method", "memberLike", "property"],
			format: ["camelCase"],
		},
		{
			selector: "variableLike",
			format: ["camelCase", "PascalCase"], // PascalCase required for cases where we use variables like class / enum objects.
			leadingUnderscore: "allow", // Allowed to avoid shadowing existing properties / variables in some cases
		},
		{
			selector: ["typeLike"],
			format: ["PascalCase"],
		},
		{
			selector: "enumMember",
			format: ["PascalCase"],
		},
		{
			selector: "typeParameter",
			format: ["PascalCase"],
			// Require "T" prefix for type parameters.
			custom: {
				regex: "^(T[A-Z]|T$)",
				match: true,
			},
		},
	],
};

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
			selector: "accessor",
			modifiers: ["private"],
			format: ["camelCase"],
			leadingUnderscore: "allow",
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

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [
		require.resolve("@fluidframework/eslint-config-fluid"),
		"prettier",
		"../../.eslintrc.cjs",
		"plugin:react/recommended",
		"plugin:react-hooks/recommended",
	],
	plugins: ["react", "react-hooks"],
	rules: {
		// TODO: AB#18875 - Re-enable react/no-deprecated once we replace uses of the deprecated ReactDOM.render()
		// with the new React 18 createRoot().
		"react/no-deprecated": "off",
		"react-hooks/exhaustive-deps": ["error"],
		"react-hooks/rules-of-hooks": "error",
		"react/jsx-key": [
			"error",
			{ checkFragmentShorthand: true, checkKeyMustBeforeSpread: true, warnOnDuplicates: true },
		],
		"react/jsx-boolean-value": ["error", "always"],
		"react/jsx-fragments": "error",
		"react/no-string-refs": "error",
		"react/no-unstable-nested-components": ["error", { allowAsProps: true }],
		"react/self-closing-comp": "error",
		"react/jsx-no-target-blank": "error",
		// This is useful for catching potential performance issues, but also makes the code more verbose.
		//"react/jsx-no-bind": "error",
		// Avoid using fragments when `null` could be used instead
		"react/jsx-no-useless-fragment": ["error", { allowExpressions: true }],
		"react/prop-types": "off",
	},
};

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
module.exports = {
	// Babel configuration for Jest and React

	// Use @babel/preset-env to automatically determine the ECMAScript version
	// based on the current Node.js version (for Jest environment).
	presets: [
		"@babel/preset-env",

		// Add @babel/preset-react for React JSX syntax support.
		"@babel/preset-react",
	],
};

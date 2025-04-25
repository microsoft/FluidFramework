/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

interface Window {
	trustedTypes?: {
		createPolicy: (
			name: string,
			rules: {
				createHTML: (input: string) => string;
				createScript: (input: string) => string;
				createScriptURL: (input: string) => string;
			},
		) => void;
		getPolicy: (name: string) => unknown;
	};
}

if (
	typeof window !== "undefined" &&
	window.trustedTypes &&
	typeof window.trustedTypes.createPolicy === "function"
) {
	if (
		typeof window.trustedTypes.getPolicy !== "function" ||
		!window.trustedTypes.getPolicy("default")
	) {
		window.trustedTypes.createPolicy("default", {
			createHTML: (input) => input,
			createScript: (input) => input,
			createScriptURL: (input) => input,
		});
	}
}

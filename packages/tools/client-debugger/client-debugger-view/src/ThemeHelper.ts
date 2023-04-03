/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { webDarkTheme, webLightTheme, Theme } from "@fluentui/react-components";

/**
 * Utility function to get the current fluent ui for use
 * @returns Theme object of FluentUI to be used for dev tool
 */
export function flueUIThemeToUse(): Theme {
	let defaultTheme = webLightTheme;

	if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
		// The user has a dark theme set in their web browser
		console.log("Dark theme detected.");
		defaultTheme = webDarkTheme;
	}

	return defaultTheme;
}

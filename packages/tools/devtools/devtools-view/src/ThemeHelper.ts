/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	webDarkTheme,
	webLightTheme,
	teamsHighContrastTheme,
	Theme,
} from "@fluentui/react-components";

/**
 * Utility function to get the current Fluent UI theme to use.
 * @returns Theme object of FluentUI to be used for dev tool
 */
export function getFluentUIThemeToUse(): Theme {
	let defaultTheme = webLightTheme;

	// API reference: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme
	if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
		defaultTheme = webDarkTheme;
	}

	// Add a condition to check for high contrast mode
	// API reference: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors
	if (window.matchMedia?.("(forced-colors: active)").matches) {
		defaultTheme = teamsHighContrastTheme;
	}

	return defaultTheme;
}

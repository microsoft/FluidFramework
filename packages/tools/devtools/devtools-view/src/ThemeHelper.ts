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

teamsHighContrastTheme.colorSubtleBackgroundHover = "#1aebff";
teamsHighContrastTheme.colorBrandBackground2 = "#1aebff";
teamsHighContrastTheme.colorCompoundBrandStroke = "#000";
teamsHighContrastTheme.colorCompoundBrandForeground1 = "#000";
teamsHighContrastTheme.colorNeutralStrokeAccessible = "#000";

/**
 * Utility function to get the current Fluent UI theme to use.
 * @returns Theme object of FluentUI to be used for dev tool
 */
export function getFluentUIThemeToUse(): { name: string; theme: Theme } {
	let defaultTheme = {
		name: "light",
		theme: webLightTheme,
	};

	// API reference: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme
	if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
		defaultTheme = {
			name: "dark",
			theme: webDarkTheme,
		};
	}

	// Add a condition to check for high contrast mode
	// API reference: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors
	if (window.matchMedia?.("(forced-colors: active)").matches) {
		defaultTheme = {
			name: "highcontrast",
			theme: teamsHighContrastTheme,
		};
	}

	return defaultTheme;
}

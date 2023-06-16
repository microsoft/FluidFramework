/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
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

// Create a type for the context value
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type ThemeContextValue = {
	themeInfo: { name: string; theme: Theme };
	setTheme: React.Dispatch<React.SetStateAction<{ name: string; theme: Theme }>>;
};

/**
 * Context for accessing a shared theme for communicating with the webpage.
 * @remarks setTheme is initially defined with a no-operation function as a placeholder
 * because we don't currently have a setter. The placeholder fills ThemeContext
 * until The React setter is truly defined in DevToolsView.
 */
export const ThemeContext = React.createContext<ThemeContextValue>({
	themeInfo: getFluentUIThemeToUse(),
	setTheme: () => {},
});

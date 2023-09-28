/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import {
	webDarkTheme,
	webLightTheme,
	teamsHighContrastTheme,
	type Theme,
} from "@fluentui/react-components";

teamsHighContrastTheme.colorSubtleBackgroundHover = "#1aebff";
teamsHighContrastTheme.colorBrandBackground2 = "#1aebff";
teamsHighContrastTheme.colorCompoundBrandForeground1 = "#000";
teamsHighContrastTheme.colorNeutralStrokeDisabled = "#D3D3D3";
teamsHighContrastTheme.colorNeutralForegroundDisabled = "#D3D3D3";

/**
 * An enum with options for the DevTools themes.
 */
export const enum ThemeOption {
	Light = "Light",
	Dark = "Dark",
	HighContrast = "High Contrast",
}

/**
 * Light theme used by the devtools UI.
 */
export const lightTheme: ThemeInfo = {
	name: ThemeOption.Light,
	theme: webLightTheme,
};

/**
 * Dark theme used by the devtools UI.
 */
export const darkTheme: ThemeInfo = {
	name: ThemeOption.Dark,
	theme: webDarkTheme,
};

/**
 * High-contrast theme used by the devtools UI.
 */
export const highContrastTheme: ThemeInfo = {
	name: ThemeOption.HighContrast,
	theme: teamsHighContrastTheme,
};

/**
 * Utility function to get the current Fluent UI theme to use.
 * @returns Theme object of FluentUI to be used for devtools.
 */
export function getFluentUIThemeToUse(): ThemeInfo {
	// API reference: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme
	if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
		return darkTheme;
	}

	// Add a condition to check for high contrast mode
	// API reference: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors
	if (window.matchMedia?.("(forced-colors: active)").matches) {
		return highContrastTheme;
	}

	return lightTheme;
}

/**
 * Pairs a FluentUI theme with a human-readable name.
 */
export interface ThemeInfo {
	/**
	 * The name of the theme.
	 */
	name: ThemeOption;

	/**
	 * The underlying theme.
	 */
	theme: Theme;
}

/**
 * The data used by {@link ThemeContext}.
 */
export interface ThemeContextValue {
	/**
	 * The theme being used.
	 */
	themeInfo: ThemeInfo;

	/**
	 * Sets the context theme to the one provided.
	 */
	setTheme: React.Dispatch<React.SetStateAction<ThemeInfo>>;
}

/**
 * Context for accessing a shared theme for communicating with the webpage.
 * @remarks setTheme is initially defined with a no-operation function as a placeholder
 * because we don't currently have a setter. The placeholder fills ThemeContext
 * until The React setter is truly defined in DevToolsView.
 */
export const ThemeContext = React.createContext<ThemeContextValue>({
	themeInfo: getFluentUIThemeToUse(),
	setTheme: () => {
		console.warn("Attempting to set context theme before context has been initialized.");
	},
});

/**
 * Gets the currently set {@link ThemeContext} and returns its value.
 * @throws If the context is not set.
 */
export function useThemeContext(): ThemeContextValue {
	const context = React.useContext(ThemeContext);
	if (context === undefined) {
		throw new Error("ThemeContext was not set.");
	}
	return context;
}

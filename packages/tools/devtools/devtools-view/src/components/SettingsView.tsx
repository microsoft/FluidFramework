/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import {
	Dropdown,
	Option,
	makeStyles,
	shorthands,
	teamsHighContrastTheme,
	webDarkTheme,
	webLightTheme,
} from "@fluentui/react-components";

import { ThemeContext } from "../ThemeHelper";

/**
 * An enum with options for the DevTools themes.
 */
export enum ThemeOption {
	Light = "Light",
	Dark = "Dark",
	HighContrast = "High Contrast",
}

/**
 * A map to convert selected theme property to more user friendly displayed value.
 */
type ThemeName = "light" | "dark" | "highContrast";

const themeReadableOption: Record<ThemeName, ThemeOption> = {
	light: ThemeOption.Light,
	dark: ThemeOption.Dark,
	highContrast: ThemeOption.HighContrast,
};

const useStyles = makeStyles({
	root: {
		...shorthands.gap("10px"),
		alignItems: "start",
		display: "grid",
		justifyItems: "start",
		height: "100%",
		width: "100%",
	},

	/**
	 * Styles to apply to option entries
	 * (container around label and value)
	 */
	option: {
		display: "flex",
		flexDirection: "column",
	},

	/**
	 * Styles to apply to settings option labels
	 */
	label: { fontSize: "12px" },

	/**
	 * Styles to apply to settings option drop-downs
	 */
	dropdown: {
		minWidth: "150px",
		fontWeight: "bold",
	},
});
/**
 * Settings page for the devtools.
 */
export function SettingsView(): React.ReactElement {
	const { themeInfo, setTheme } = React.useContext(ThemeContext) ?? {};

	const styles = useStyles();

	function handleThemeChange(
		event,
		option: {
			optionValue: string | undefined;
			optionText: string | undefined;
			selectedOptions: string[];
		},
	): void {
		switch (option.optionValue) {
			case ThemeOption.Light:
				setTheme({
					name: "light",
					theme: webLightTheme,
				});
				break;
			case ThemeOption.Dark:
				setTheme({
					name: "dark",
					theme: webDarkTheme,
				});
				break;
			case ThemeOption.HighContrast:
				setTheme({
					name: "highContrast",
					theme: teamsHighContrastTheme,
				});
				break;
			default:
				setTheme({
					name: "dark",
					theme: webDarkTheme,
				});
				break;
		}
	}

	return (
		<div className={styles.root}>
			<div className={styles.option}>
				<label className={styles.label}>Select theme</label>
				<Dropdown
					value={themeReadableOption[themeInfo.name as ThemeName]}
					className={styles.dropdown}
					onOptionSelect={handleThemeChange}
				>
					<Option value={ThemeOption.Light}>Light</Option>
					<Option value={ThemeOption.Dark}>Dark</Option>
					<Option value={ThemeOption.HighContrast}>High Contrast</Option>
				</Dropdown>
			</div>
		</div>
	);
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import {
	Dropdown,
	Option,
	makeStyles,
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

const useStyles = makeStyles({
	root: {
		justifyItems: "start",
		height: "100%",
		width: "100%",
	},

	/**
	 * Styles to apply to sections (groupings of related options, with a header)
	 */
	section: {
		display: "flex",
		flexDirection: "column",
	},

	/**
	 * Styles to apply to section headers
	 */
	sectionHeader: {
		fontWeight: "bold",
	},

	/**
	 * Styles to apply to option entries within a section (container around label and value)
	 */
	option: {
		display: "flex",
		flexDirection: "column",
	},

	/**
	 * Styles to apply to settings option drop-downs
	 */
	dropdown: {
		width: "180px",
	},
});

/**
 * Settings page for the devtools.
 */
export function SettingsView(): React.ReactElement {
	const { setTheme } = React.useContext(ThemeContext) ?? {};

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
			<div className={styles.section}>
				<h4 className={styles.sectionHeader}>Theme</h4>
				<Dropdown
					placeholder="Select a theme"
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

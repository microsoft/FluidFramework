/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import {
	Dropdown,
	Option,
	teamsHighContrastTheme,
	Theme,
	webDarkTheme,
	webLightTheme,
} from "@fluentui/react-components";

/**
 * An enum with options for the DevTools themes.
 */
export enum ThemeOption {
	Light = "Light",
	Dark = "Dark",
	HighContrast = "High Contrast",
}
interface SettingsProps {
	/**
	 * Sets the theme of the DevTools app (light, dark, high contrast)
	 */
	setTheme(newTheme: Theme): void;
}
/**
 * Settings page for the debugger
 */
export function SettingsView(props: SettingsProps): React.ReactElement {
	const { setTheme } = props;
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
				setTheme(webLightTheme);
				break;
			case ThemeOption.Dark:
				setTheme(webDarkTheme);
				break;
			case ThemeOption.HighContrast:
				setTheme(teamsHighContrastTheme);
				break;
			default:
				setTheme(webDarkTheme);
				break;
		}
	}
	return (
		<div
			style={{
				marginLeft: "10px",
				display: "grid",
				justifyItems: "start",
			}}
		>
			<label style={{ fontSize: "12px" }}>Select theme</label>
			<Dropdown
				placeholder="Theme"
				style={{ minWidth: "150px", fontWeight: "bold" }}
				onOptionSelect={handleThemeChange}
			>
				<Option value={ThemeOption.Light}>Light</Option>
				<Option value={ThemeOption.Dark}>Dark</Option>
				<Option value={ThemeOption.HighContrast}>High Contrast</Option>
			</Dropdown>
		</div>
	);
}

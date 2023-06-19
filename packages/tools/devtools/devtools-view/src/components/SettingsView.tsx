/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import {
	Dropdown,
	Option,
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
 * Settings page for the debugger
 */
export function SettingsView(): React.ReactElement {
	const { setTheme } = React.useContext(ThemeContext) ?? {};
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
				style={{
					minWidth: "150px",
					fontWeight: "bold",
				}}
				onOptionSelect={handleThemeChange}
			>
				<Option value={ThemeOption.Light}>Light</Option>
				<Option value={ThemeOption.Dark}>Dark</Option>
				<Option value={ThemeOption.HighContrast}>High Contrast</Option>
			</Dropdown>
		</div>
	);
}

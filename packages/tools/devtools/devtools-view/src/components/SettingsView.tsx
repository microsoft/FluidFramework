/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import {
	Dropdown,
	Link,
	Option,
	Switch,
	makeStyles,
	teamsHighContrastTheme,
	webDarkTheme,
	webLightTheme,
} from "@fluentui/react-components";

import { ThemeOption, useThemeContext } from "../ThemeHelper";
import { useTelemetryOptIn } from "../TelemetryUtils";

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
 *
 * @remarks {@link ThemeContext} must be set in order to use this component.
 */
export function SettingsView(): React.ReactElement {
	const { themeInfo, setTheme } = useThemeContext();

	const styles = useStyles();
	const [optedIn, setOptedIn] = useTelemetryOptIn();

	function handleThemeChange(
		_event,
		option: {
			optionValue: string | undefined;
			optionText: string | undefined;
			selectedOptions: string[];
		},
	): void {
		switch (option.optionValue) {
			case ThemeOption.Light: {
				setTheme({
					name: ThemeOption.Light,
					theme: webLightTheme,
				});
				break;
			}
			case ThemeOption.Dark: {
				setTheme({
					name: ThemeOption.Dark,
					theme: webDarkTheme,
				});
				break;
			}
			case ThemeOption.HighContrast: {
				setTheme({
					name: ThemeOption.HighContrast,
					theme: teamsHighContrastTheme,
				});
				break;
			}
			default: {
				setTheme({
					name: ThemeOption.Dark,
					theme: webDarkTheme,
				});
				break;
			}
		}
	}

	return (
		<div className={styles.root}>
			<div className={styles.section}>
				<h4 className={styles.sectionHeader}>Theme</h4>
				<Dropdown
					value={themeInfo.name}
					className={styles.dropdown}
					onOptionSelect={handleThemeChange}
				>
					<Option value={ThemeOption.Light}>Light</Option>
					<Option value={ThemeOption.Dark}>Dark</Option>
					<Option value={ThemeOption.HighContrast}>High Contrast</Option>
				</Dropdown>
			</div>
			<div className={styles.section}>
				<h4 className={styles.sectionHeader}>Usage telemetry</h4>
				<Link
					href="https://go.microsoft.com/fwlink/?LinkId=521839"
					target="_blank"
					rel="noreferrer"
					inline
				>
					Microsoft Privacy Statement
				</Link>
				<Switch
					label="Send usage telemetry to Microsoft"
					checked={optedIn}
					onChange={(ev, data): void => setOptedIn(data.checked)}
				/>
			</div>
		</div>
	);
}

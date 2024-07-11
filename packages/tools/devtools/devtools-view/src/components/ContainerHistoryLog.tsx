/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Table,
	TableBody,
	TableCell,
	TableHeader,
	TableHeaderCell,
	TableRow,
	tokens,
} from "@fluentui/react-components";
import {
	AlertBadgeRegular,
	Attach20Regular,
	Clock12Regular,
	ErrorCircle20Regular,
	LockClosed20Filled,
	PlugConnected20Regular,
	PlugDisconnected20Regular,
	Warning20Regular,
} from "@fluentui/react-icons";
import type { ConnectionStateChangeLogEntry } from "@fluidframework/devtools-core/internal";
import React from "react";

import { ThemeContext, ThemeOption } from "../ThemeHelper.js";

import { LabelCellLayout } from "./utility-components/index.js";

/**
 * Returns the text color based on the current color theme of the devtools.
 */
function setThemeStyle(themeName: ThemeOption, state: string): string {
	if (themeName === ThemeOption.HighContrast) {
		switch (state) {
			case "attached": {
				return "#FFF";
			}
			case "closed": {
				return "#000";
			}
			case "connected": {
				return "#FFF";
			}
			case "disconnected": {
				return "#000";
			}
			case "disposed": {
				return "#000";
			}
			default: {
				console.log("Unknown state type for container!");
				return "";
			}
		}
	}
	return "";
}

/**
 * Represents container state history data which is rendered in {@link ContainerHistoryLog}.
 */
export interface ContainerHistoryLogProps {
	/**
	 * containerHistory containing clientId & StateChangeLogEntry data.
	 */
	containerHistory: readonly ConnectionStateChangeLogEntry[] | undefined;
}

/**
 * Renders current state of the connected container.
 */
export function ContainerHistoryLog(props: ContainerHistoryLogProps): React.ReactElement {
	const { containerHistory } = props;
	const { themeInfo } = React.useContext(ThemeContext);

	// Columns for rendering container state history.
	const containerHistoryColumns = [
		{ columnKey: "state", label: "State" },
		{ columnKey: "time", label: "Time" },
	];

	const getBackgroundColorForState = (state: string): string => {
		switch (state) {
			case "attached": {
				// blue
				return tokens.colorPaletteRoyalBlueBackground2;
			}
			case "closed": {
				// red
				return tokens.colorPaletteRedBorder1;
			}
			case "connected": {
				// green
				return tokens.colorPaletteGreenBackground2;
			}
			case "disconnected": {
				// orange
				return tokens.colorPaletteDarkOrangeBorder1;
			}
			case "disposed": {
				// dark red
				return tokens.colorPaletteDarkRedBackground2;
			}
			default: {
				console.log("Unknown state type for container!");

				// black
				return tokens.colorBrandBackgroundPressed;
			}
		}
	};

	return (
		<Table size="extra-small" aria-label="Audience history table">
			<TableHeader>
				<TableRow>
					{containerHistoryColumns.map((column, columnIndex) => (
						<TableHeaderCell key={columnIndex}>
							{column.columnKey === "state" && (
								<LabelCellLayout icon={<AlertBadgeRegular />}>{column.label}</LabelCellLayout>
							)}
							{column.columnKey === "time" && (
								<LabelCellLayout icon={<Clock12Regular />}>{column.label}</LabelCellLayout>
							)}
						</TableHeaderCell>
					))}
				</TableRow>
			</TableHeader>
			<TableBody>
				{containerHistory?.map((item, itemIndex) => {
					const nowTimeStamp = new Date();
					const changeTimeStamp = new Date(item.timestamp);
					const wasChangeToday = nowTimeStamp.getDate() === changeTimeStamp.getDate();

					const timestampDisplay = wasChangeToday
						? changeTimeStamp.toTimeString()
						: changeTimeStamp.toDateString();

					const getStateIcon = (state: string): React.ReactElement => {
						switch (state) {
							case "attached": {
								return <Attach20Regular />;
							}
							case "closed": {
								return <LockClosed20Filled />;
							}
							case "connected": {
								return <PlugConnected20Regular />;
							}
							case "disconnected": {
								return <PlugDisconnected20Regular />;
							}
							case "disposed": {
								return <ErrorCircle20Regular />;
							}
							default: {
								console.log("Unknown state type for container!");
								return <Warning20Regular />;
							}
						}
					};

					return (
						<TableRow
							key={itemIndex}
							style={{
								backgroundColor: getBackgroundColorForState(item.newState),
							}}
						>
							<TableCell style={{ color: setThemeStyle(themeInfo.name, item.newState) }}>
								<LabelCellLayout icon={getStateIcon(item.newState)}>
									<span
										style={{
											color: setThemeStyle(themeInfo.name, item.newState),
										}}
									>
										{item.newState}
									</span>
								</LabelCellLayout>
							</TableCell>
							<TableCell style={{ color: setThemeStyle(themeInfo.name, item.newState) }}>
								{timestampDisplay}
							</TableCell>
						</TableRow>
					);
				})}
			</TableBody>
		</Table>
	);
}

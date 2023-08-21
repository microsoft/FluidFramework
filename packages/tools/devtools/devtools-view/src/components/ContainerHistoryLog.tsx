/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import {
	tokens,
	TableBody,
	TableCell,
	TableRow,
	Table,
	TableHeader,
	TableHeaderCell,
} from "@fluentui/react-components";
import {
	Clock12Regular,
	PlugConnected20Regular,
	AlertBadgeRegular,
	PlugDisconnected20Regular,
	ErrorCircle20Regular,
	Warning20Regular,
	Attach20Regular,
	LockClosed20Filled,
} from "@fluentui/react-icons";
import { ConnectionStateChangeLogEntry } from "@fluid-experimental/devtools-core";

import { ThemeContext, ThemeOption } from "../ThemeHelper";
import { LabelCellLayout } from "./utility-components";

/**
 * Returns the text color based on the current color theme of the devtools.
 */
function setThemeStyle(themeName: string, state: string): string {
	if (themeName === ThemeOption.HighContrast) {
		switch (state) {
			case "attached":
				return "#FFF";
			case "closed":
				return "#000";
			case "connected":
				return "#FFF";
			case "disconnected":
				return "#000";
			case "disposed":
				return "#000";
			default:
				console.log("Unknown state type for container!");
				return "";
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
			case "attached":
				return tokens.colorPaletteRoyalBlueBackground2; // blue
			case "closed":
				return tokens.colorPaletteRedBorder1; // red
			case "connected":
				return tokens.colorPaletteGreenBackground2; // green
			case "disconnected":
				return tokens.colorPaletteDarkOrangeBorderActive; // orange
			case "disposed":
				return tokens.colorPaletteDarkRedBackground2; // dark red
			default:
				console.log("Unknown state type for container!");
				return tokens.colorBrandBackgroundPressed; // black
		}
	};

	return (
		<Table size="extra-small" aria-label="Audience history table">
			<TableHeader>
				<TableRow>
					{containerHistoryColumns.map((column, columnIndex) => (
						<TableHeaderCell key={columnIndex}>
							{column.columnKey === "state" && (
								<LabelCellLayout icon={<AlertBadgeRegular />}>
									{column.label}
								</LabelCellLayout>
							)}
							{column.columnKey === "time" && (
								<LabelCellLayout icon={<Clock12Regular />}>
									{column.label}
								</LabelCellLayout>
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
							case "attached":
								return <Attach20Regular />;
							case "closed":
								return <LockClosed20Filled />;
							case "connected":
								return <PlugConnected20Regular />;
							case "disconnected":
								return <PlugDisconnected20Regular />;
							case "disposed":
								return <ErrorCircle20Regular />;
							default:
								console.log("Unknown state type for container!");
								return <Warning20Regular />;
						}
					};

					return (
						<TableRow
							key={itemIndex}
							style={{
								backgroundColor: getBackgroundColorForState(item.newState),
							}}
						>
							<TableCell
								style={{ color: setThemeStyle(themeInfo.name, item.newState) }}
							>
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
							<TableCell
								style={{ color: setThemeStyle(themeInfo.name, item.newState) }}
							>
								{timestampDisplay}
							</TableCell>
						</TableRow>
					);
				})}
			</TableBody>
		</Table>
	);
}

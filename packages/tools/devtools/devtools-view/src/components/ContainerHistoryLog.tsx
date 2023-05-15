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
import { Stack, StackItem, IStackItemStyles } from "@fluentui/react";
import { ConnectionStateChangeLogEntry } from "@fluid-experimental/devtools-core";

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

	const itemStyles: IStackItemStyles = {
		root: {
			paddingTop: "6px",
			paddingBottom: "6px",
		},
	};

	const itemStateStyle: IStackItemStyles = {
		root: {
			marginTop: "8px",
			marginBottom: "8px",
			marginLeft: "5px",
		},
	};

	return (
		<Table size="extra-small" aria-label="Audience history table">
			<TableHeader>
				<TableRow>
					{containerHistoryColumns.map((column, columnIndex) => (
						<TableHeaderCell key={columnIndex}>
							{column.columnKey === "state" && <AlertBadgeRegular />}
							{column.columnKey === "time" && <Clock12Regular />}
							{column.label}
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
							<TableCell>
								<Stack horizontal>
									<StackItem styles={itemStyles}>
										{getStateIcon(item.newState)}
									</StackItem>
									<StackItem styles={itemStateStyle}>{item.newState}</StackItem>
								</Stack>
							</TableCell>
							<TableCell>{timestampDisplay}</TableCell>
						</TableRow>
					);
				})}
			</TableBody>
		</Table>
	);
}

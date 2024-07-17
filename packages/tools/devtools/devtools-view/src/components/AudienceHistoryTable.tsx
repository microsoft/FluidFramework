/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Table,
	TableBody,
	TableCell,
	TableHeader,
	TableRow,
	makeStyles,
	tokens,
} from "@fluentui/react-components";
import {
	ArrowExitRegular,
	ArrowJoinRegular,
	Clock12Regular,
	DoorArrowLeftRegular,
	Person12Regular,
} from "@fluentui/react-icons";
import React from "react";

import { ThemeOption, useThemeContext } from "../ThemeHelper.js";

import type { TransformedAudienceHistoryData } from "./AudienceView.js";
import { clientIdTooltipText } from "./TooltipTexts.js";
import { LabelCellLayout } from "./utility-components/index.js";

const audienceStyles = makeStyles({
	joined: {
		backgroundColor: tokens.colorPaletteRoyalBlueBackground2,
	},
	left: {
		backgroundColor: tokens.colorPaletteRedBackground2,
	},
	highContrast: {
		"color": "#FFF",
		"&:hover": {
			"color": "#000",
			"& *": {
				color: "#000",
			},
		},
	},
});

/**
 * Represents audience history data filtered to the attributes that will be displayed in the history table.
 */
export interface AudienceHistoryTableProps {
	/**
	 * Filtered audience data from {@link audienceHistoryDataFilter}
	 * Containing clientId, timestamp & event.
	 */
	audienceHistoryItems: TransformedAudienceHistoryData[];
}

/**
 * Renders audience history data of user status event, clientId & timestamp.
 *
 * @remarks {@link ThemeContext} must be set in order to use this component.
 */
export function AudienceHistoryTable(props: AudienceHistoryTableProps): React.ReactElement {
	const { audienceHistoryItems } = props;
	const { themeInfo } = useThemeContext();

	const style = audienceStyles();

	// Columns for rendering audience history
	const audienceHistoryColumns = [
		{ columnKey: "event", label: "Event" },
		{ columnKey: "clientId", label: "Client ID" },
		{ columnKey: "time", label: "Time" },
	];

	return (
		<Table size="extra-small" aria-label="Audience history table">
			<TableHeader>
				<TableRow>
					{audienceHistoryColumns.map((column, columnIndex) => (
						// TODO: Replace TableCell with TableHeaderCell once https://github.com/microsoft/fluentui/issues/31588 is fixed.
						<TableCell key={columnIndex}>
							{column.columnKey === "event" && (
								<LabelCellLayout icon={<DoorArrowLeftRegular />}>
									{column.label}
								</LabelCellLayout>
							)}

							{column.columnKey === "clientId" && (
								<LabelCellLayout
									icon={<Person12Regular />}
									aria-label="Client ID"
									infoTooltipContent={clientIdTooltipText}
								>
									{column.label}
								</LabelCellLayout>
							)}
							{column.columnKey === "time" && (
								<LabelCellLayout icon={<Clock12Regular />}>{column.label}</LabelCellLayout>
							)}
						</TableCell>
					))}
				</TableRow>
			</TableHeader>
			<TableBody>
				{audienceHistoryItems.map((item, itemIndex) => (
					<TableRow
						// The list of items here is never reordered, and is strictly appended to,
						// so using the index as the key here is safe.
						key={itemIndex}
						className={
							themeInfo.name === ThemeOption.HighContrast
								? style.highContrast
								: item.changeKind === "joined"
									? style.joined
									: style.left
						}
					>
						<TableCell>
							<LabelCellLayout
								icon={
									item.changeKind === "joined" ? <ArrowJoinRegular /> : <ArrowExitRegular />
								}
							>
								{item.changeKind}
							</LabelCellLayout>
						</TableCell>
						<TableCell>{item.clientId}</TableCell>
						<TableCell>{item.time}</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

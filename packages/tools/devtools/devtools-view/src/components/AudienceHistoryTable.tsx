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
	DoorArrowLeftRegular,
	Clock12Regular,
	Person12Regular,
	ArrowJoinRegular,
	ArrowExitRegular,
} from "@fluentui/react-icons";

import { clientIdTooltipText } from "./TooltipTexts";
import { TransformedAudienceHistoryData } from "./AudienceView";
import { LabelCellLayout } from "./utility-components";

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
 */
export function AudienceHistoryTable(props: AudienceHistoryTableProps): React.ReactElement {
	const { audienceHistoryItems } = props;

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
						<TableHeaderCell key={columnIndex}>
							{column.columnKey === "event" && (
								<LabelCellLayout icon={<DoorArrowLeftRegular />}>
									{column.label}
								</LabelCellLayout>
							)}

							{column.columnKey === "clientId" && (
								<LabelCellLayout
									icon={<Person12Regular />}
									infoTooltipContent={clientIdTooltipText}
								>
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
				{audienceHistoryItems.map((item, itemIndex) => (
					<TableRow
						key={itemIndex}
						style={{
							backgroundColor:
								item.changeKind === "joined"
									? tokens.colorPaletteRoyalBlueBackground2
									: tokens.colorPaletteRedBorder1,
						}}
					>
						<TableCell>
							<LabelCellLayout
								icon={
									item.changeKind === "joined" ? (
										<ArrowJoinRegular />
									) : (
										<ArrowExitRegular />
									)
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

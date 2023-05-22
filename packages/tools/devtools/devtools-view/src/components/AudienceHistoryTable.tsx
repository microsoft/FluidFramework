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
import { TooltipHost } from "@fluentui/react";
import { useId } from "@fluentui/react-hooks";
import {
	DoorArrowLeftRegular,
	Clock12Regular,
	Person12Regular,
	Info12Regular,
} from "@fluentui/react-icons";
import { clientIdTooltipText } from "./TooltipTexts";
import { TransformedAudienceHistoryData } from "./AudienceView";

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

	const clientIdTooltipId = useId("client-id-tooltip");

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
								<>
									<DoorArrowLeftRegular />
									{column.label}
								</>
							)}

							{column.columnKey === "clientId" && (
								<TooltipHost content={clientIdTooltipText} id={clientIdTooltipId}>
									<div style={{ display: "flex", alignItems: "center" }}>
										<Person12Regular />
										<span style={{ marginLeft: "5px" }}>{column.label}</span>
										<Info12Regular style={{ marginLeft: "5px" }} />
									</div>
								</TooltipHost>
							)}
							{column.columnKey === "time" && (
								<>
									<Clock12Regular />
									{column.label}
								</>
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
						<TableCell>{item.changeKind}</TableCell>
						<TableCell>{item.clientId}</TableCell>
						<TableCell>{item.time}</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

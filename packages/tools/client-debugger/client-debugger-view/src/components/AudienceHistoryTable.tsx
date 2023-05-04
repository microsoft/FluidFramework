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
	Clock20Regular,
	DoorArrowLeft24Regular,
	Person24Regular,
	Info16Regular,
} from "@fluentui/react-icons";
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

	const TOOLTIP_FLUIDCLIENTGUID =
		"ID assigned by the Fluid (sequencing) service to the current connection. Subject to change if the client disconnects or reconnects.";
	const clientIdTooltipId = useId("client-id-tooltip");

	// Columns for rendering audience history
	const audienceHistoryColumns = [
		{ columnKey: "event", label: "Event" },
		{ columnKey: "clientId", label: "Client ID" },
		{ columnKey: "time", label: "Time" },
	];

	return (
		<Table size="small" aria-label="Audience history table">
			<TableHeader>
				<TableRow>
					{audienceHistoryColumns.map((column, columnIndex) => (
						<TableHeaderCell key={columnIndex}>
							{column.columnKey === "event" && (
								<>
									<DoorArrowLeft24Regular />
									{column.label}
								</>
							)}

							{column.columnKey === "clientId" && (
								<TooltipHost
									content={TOOLTIP_FLUIDCLIENTGUID}
									id={clientIdTooltipId}
								>
									<Person24Regular />
									{column.label}
									<Info16Regular
										style={{
											position: "relative",
											top: "3px",
											marginLeft: "5px",
										}}
									/>
								</TooltipHost>
							)}
							{column.columnKey === "time" && (
								<>
									<Clock20Regular />
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
								item.changeKind === "added"
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

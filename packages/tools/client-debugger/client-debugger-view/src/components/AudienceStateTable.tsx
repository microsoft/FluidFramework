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
import { useId } from "@fluentui/react-hooks";
import { TooltipHost } from "@fluentui/react";
import { EditRegular, Search20Regular, Person24Regular } from "@fluentui/react-icons";
import { TransformedAudienceStateData } from "./AudienceView";

/**
 * Represents audience state data filtered to the attributes that will be displayed in the state table.
 */
export interface AudienceStateTableProps {
	/**
	 * Filtered audience state data from {@link audienceStateDataFilter}
	 * Containing clientId, userId, mode, scopes & myClientConnection.
	 */
	audienceStateItems: TransformedAudienceStateData[];
}

/**
 * Renders audience state data of client(s)'s clientId, userId, mode, and scopres who are currently connected to the container.
 */
export function AudienceStateTable(props: AudienceStateTableProps): React.ReactElement {
	const { audienceStateItems } = props;

	const clientIdTooltipId = useId("client-id-tooltip");
	const userIdTooltipId = useId("user-id-tooltip");

	// Columns for rendering audience state
	const audienceStateColumns = [
		{ columnKey: "clientId", label: "Client ID" },
		{ columnKey: "userId", label: "User ID" },
		{ columnKey: "mode", label: "Mode" },
		{ columnKey: "scopes", label: "Scopes" },
	];

	return (
		<Table size="small" aria-label="Audience state table">
			<TableHeader>
				<TableRow>
					{audienceStateColumns.map((column, columnIndex) => (
						<TableHeaderCell key={columnIndex}>
							<TooltipHost
								content="Represents the connection between Fluid Runtime and the Fluid server."
								id={clientIdTooltipId}
							>
								{column.columnKey === "clientId" && <Person24Regular />}
							</TooltipHost>
							<TooltipHost
								content="Represents the application specific user identifier. Randomly generated unless specified by the application."
								id={userIdTooltipId}
							>
								{column.columnKey === "userId" && <Person24Regular />}
							</TooltipHost>
							{column.columnKey === "mode" && <EditRegular />}
							{column.columnKey === "scopes" && <Search20Regular />}
							{column.label}
						</TableHeaderCell>
					))}
				</TableRow>
			</TableHeader>
			<TableBody>
				{audienceStateItems.map((item, itemIndex) => {
					const isCurrentUser =
						item.myClientConnection !== undefined &&
						item.myClientConnection.user.id === item.userId;

					return (
						<TableRow
							key={itemIndex}
							style={{
								backgroundColor: isCurrentUser
									? tokens.colorPaletteGreenBorder1
									: "",
							}}
						>
							<TableCell>
								{item.clientId}
								{isCurrentUser && " (me)"}
							</TableCell>
							<TableCell>
								{item.userId}
								{isCurrentUser && " (me)"}
							</TableCell>
							<TableCell>{item.mode}</TableCell>
							<TableCell>
								<span>{item.scopes.join("\n")}</span>
							</TableCell>
						</TableRow>
					);
				})}
			</TableBody>
		</Table>
	);
}

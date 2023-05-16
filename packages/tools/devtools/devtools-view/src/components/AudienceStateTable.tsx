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
import {
	EditRegular,
	Search12Regular,
	Person12Regular,
	Info12Regular,
} from "@fluentui/react-icons";
import { clientIdTooltipText, userIdTooltipText } from "./TooltipTexts";
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

	const clientIdTooltipId = useId("client-guid-tooltip");
	const userIdTooltipId = useId("user-guid-tooltip");

	// Columns for rendering audience state
	const audienceStateColumns = [
		{ columnKey: "clientId", label: "Client ID" },
		{ columnKey: "userId", label: "User ID" },
		{ columnKey: "mode", label: "Mode" },
		{ columnKey: "scopes", label: "Scopes" },
	];

	return (
		<Table size="extra-small" aria-label="Audience state table">
			<TableHeader>
				<TableRow>
					{audienceStateColumns.map((column, columnIndex) => (
						<TableHeaderCell key={columnIndex}>
							{column.columnKey === "clientId" && (
								<TooltipHost content={clientIdTooltipText} id={clientIdTooltipId}>
									<div style={{ display: "flex", alignItems: "center" }}>
										<Person12Regular />
										<span style={{ marginLeft: "5px" }}>{column.label}</span>
										<Info12Regular style={{ marginLeft: "5px" }} />
									</div>
								</TooltipHost>
							)}
							{column.columnKey === "userId" && (
								<TooltipHost content={userIdTooltipText} id={userIdTooltipId}>
									<div style={{ display: "flex", alignItems: "center" }}>
										<Person12Regular />
										<span style={{ marginLeft: "5px" }}>{column.label}</span>
										<Info12Regular style={{ marginLeft: "5px" }} />
									</div>
								</TooltipHost>
							)}
							{column.columnKey === "mode" && (
								<>
									<EditRegular />
									{column.label}
								</>
							)}
							{column.columnKey === "scopes" && (
								<>
									<Search12Regular />
									{column.label}
								</>
							)}
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

import React from "react";
import {
	Avatar,
	TableBody,
	TableCell,
	TableRow,
	Table,
	TableHeader,
	TableHeaderCell,
} from "@fluentui/react-components";
import { EditRegular, Search20Regular } from "@fluentui/react-icons";
import { FilteredAudienceStateData } from "./AudienceView";

/**
 * Input for {@link AudienceStateTable}
 */
export interface AudienceStateTableProps {
	audienceStateItems: FilteredAudienceStateData[];
}

/**
 * Render audience state in {@link AudienceView}
 */
export function AudienceStateTable(props: AudienceStateTableProps): React.ReactElement {
	const { audienceStateItems } = props;

	// Columns for rendering audience state
	const audienceStateColumns = [
		{ columnKey: "clientId", label: "ClientId" },
		{ columnKey: "userId", label: "UserId" },
		{ columnKey: "mode", label: "Mode" },
		{ columnKey: "scopes", label: "Scopes" },
	];

	return (
		<Table size="small" aria-label="Audience state table">
			<TableHeader>
				<TableRow>
					{audienceStateColumns.map((column, columnIndex) => (
						<TableHeaderCell key={columnIndex}>
							{column.columnKey === "clientId" && <Avatar />}
							{column.columnKey === "userId" && <Avatar />}
							{column.columnKey === "mode" && <EditRegular />}
							{column.columnKey === "scopes" && <Search20Regular />}
							{column.label}
						</TableHeaderCell>
					))}
				</TableRow>
			</TableHeader>
			<TableBody>
				{audienceStateItems.map((item, itemIndex) => (
					<TableRow
						key={itemIndex}
						style={{
							backgroundColor:
								item.myClientConnection !== undefined &&
								item.myClientConnection.user.id === item.userId
									? "#add8e6"
									: "",
						}}
					>
						<TableCell>{item.clientId}</TableCell>
						<TableCell>{item.userId}</TableCell>
						<TableCell>{item.mode}</TableCell>
						<TableCell>
							{item.scopes.map((scope, scopeIndex) => (
								<div key={scopeIndex}>{scope}</div>
							))}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

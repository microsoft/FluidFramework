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
import { Clock20Regular } from '@fluentui/react-icons';
import { FilteredAudienceHistoryData } from "./AudienceView";

/**
 * Input for {@link AudienceHistoryTable}
 */
export interface AudienceHistoryTableProps {
	audienceHistoryItems: FilteredAudienceHistoryData[];
}

/**
 * Render audience history in {@link AudienceView}
 */
export function AudienceHistoryTable(props: AudienceHistoryTableProps): React.ReactElement {
	const { audienceHistoryItems } = props;

	// Columns for rendering audience history
	const audienceHistoryColumns = [
		{ columnKey: "clientId", label: "ClientId" },
		{ columnKey: "time", label: "Time" },
	];

	return (
		<Table size="small" aria-label="Audience history table">
			<TableHeader>
				<TableRow>
					{audienceHistoryColumns.map((column, columnIndex) => (
						<TableHeaderCell key={columnIndex}>
							{column.columnKey === 'clientId' && <Avatar />}
							{column.columnKey === 'time' && <Clock20Regular />}
							{column.label}
						</TableHeaderCell>
					))}
				</TableRow>
			</TableHeader>
			<TableBody>
				{audienceHistoryItems.map((item, itemIndex) => (
					<TableRow key={itemIndex}>
						<TableCell>{item.clientId}</TableCell>
						<TableCell>{item.time}</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

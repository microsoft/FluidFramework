/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TableRow, TableCell, Input, Button, Checkbox } from "@fluentui/react-components";
import { Delete24Regular } from "@fluentui/react-icons";
import React, { DragEvent } from "react";

import { DateTime, type Column, type Row } from "./tableSchema.js";

/**
 * Props for the `TableRowView` component, which renders a single row in the table.
 */
export interface TableRowViewProps {
	/**
	 * The row data object representing the current table row to render.
	 */
	readonly row: Row;

	/**
	 * The list of columns used to determine the structure and cell rendering for this row.
	 */
	readonly columns: Column[];

	/**
	 * The index of the row within the table, used for drag-and-drop operations and styling.
	 */
	index: number;

	/**
	 * Callback fired when a row drag operation starts. Receives the index of the dragged row.
	 */
	onRowDragStart: (index: number) => void;

	/**
	 * Callback fired when a dragged row is hovered over this row; used to allow dropping.
	 */
	onRowDragOver: (event: DragEvent<HTMLTableRowElement>) => void;

	/**
	 * Callback fired when a dragged row is dropped onto this row. Receives the target index.
	 */
	onRowDrop: (index: number) => void;

	/**
	 * Callback to remove this row from the table, typically triggered by a delete button.
	 */
	onRemoveRow: (index: number) => void;
}

export const TableRowView: React.FC<TableRowViewProps> = ({
	row,
	columns,
	index,
	onRowDragStart,
	onRowDragOver,
	onRowDrop,
	onRemoveRow,
}) => (
	<TableRow
		key={row.id}
		draggable
		onDragStart={() => onRowDragStart(index)}
		onDragOver={onRowDragOver}
		onDrop={() => onRowDrop(index)}
		className={`custom-table-row ${index % 2 === 0 ? "even" : "odd"}`}
	>
		<TableCell className="custom-cell id-cell">
			<span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
				<Button
					appearance="subtle"
					size="small"
					onClick={() => onRemoveRow(index)}
					icon={<Delete24Regular />}
					style={{ padding: 0, minWidth: "auto" }}
				/>
				{row.id}
			</span>
		</TableCell>
		{columns.map((col) => {
			const cell = row.getCell(col);
			const hint = col.props?.hint ?? "text";

			return (
				<TableCell key={col.id} className="custom-cell">
					{hint === "checkbox" ? (
						<Checkbox
							checked={cell === "true"}
							onChange={(_, data) => {
								const newValue = data.checked?.toString() ?? "false";
								row.setCell(col, newValue);
							}}
						/>
					) : hint === "date" ? (
						<Input
							type="date"
							className="custom-input"
							value={cell instanceof DateTime ? cell.value.toISOString().split("T")[0] : ""}
							onChange={(e) => {
								const date = new Date(e.target.value);
								const dateObj = DateTime.fromDate(date);
								row.setCell(col, dateObj);
							}}
						/>
					) : (
						<Input
							type="text"
							appearance="underline"
							className="custom-input"
							value={typeof cell === "string" ? cell : ""}
							onChange={(e) => {
								const newVal = e.target.value;
								row.setCell(col, newVal);
							}}
						/>
					)}
				</TableCell>
			);
		})}
	</TableRow>
);

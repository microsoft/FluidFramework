/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TableRow, TableCell, Input, Button, Checkbox } from "@fluentui/react-components";
import { Delete24Regular } from "@fluentui/react-icons";
import React, { DragEvent } from "react";

import { type Column, type Row } from "../schema.js";

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
			</span>
		</TableCell>
		{columns.map((col) => {
			const cell = row.getCell(col);
			const hint = col.props?.hint ?? "text";

			return (
				<TableCell key={col.id} className="custom-cell">
					<TableCellView
						cell={cell}
						hint={hint}
						onUpdateCell={(newValue) => row.setCell(col, newValue)}
					/>
				</TableCell>
			);
		})}
	</TableRow>
);

interface TableCellViewProps {
	readonly cell: string | undefined;
	readonly hint: string | undefined;
	onUpdateCell: (newValue: string) => void;
}

export const TableCellView: React.FC<TableCellViewProps> = ({ cell, hint, onUpdateCell }) => {
	// TODO: highlight cells in red when data is invalid
	switch (hint) {
		case "checkbox": {
			return (
				<Checkbox
					checked={cell === "true"}
					onChange={(_, data) => {
						onUpdateCell(data.checked === true ? "true" : "false");
					}}
				/>
			);
			break;
		}
		case "date": {
			return (
				<Input
					type="date"
					className="custom-input"
					value={cell?.split("T")[0] ?? ""}
					onChange={(e) => {
						const date = new Date(e.target.value);
						onUpdateCell(date.toISOString());
					}}
				/>
			);
			break;
		}
		case "text":
		case undefined: {
			return (
				<Input
					type="text"
					appearance="underline"
					className="custom-input"
					value={cell ?? ""}
					onChange={(e) => {
						onUpdateCell(e.target.value);
					}}
				/>
			);
			break;
		}
		default: {
			throw new Error(`Unsupported cell hint: ${hint}`);
		}
	}
};

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TableRow, TableCell, Input, Button, Checkbox } from "@fluentui/react-components";
import { Delete24Regular } from "@fluentui/react-icons";
import React, { type DragEvent } from "react";

import type { Table } from "../schema.js";
import { useTree } from "./utilities.js";

/**
 * Props for the `TableRowView` component, which renders a single row in the table.
 */
export interface TableRowViewProps {
	readonly table: Table;

	/**
	 * The index of the row being displayed.
	 */
	readonly rowIndex: number;

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
}

export const TableRowView: React.FC<TableRowViewProps> = ({
	table,
	rowIndex,
	onRowDragStart,
	onRowDragOver,
	onRowDrop,
}) => {
	useTree(table);

	const row = table.getRow(rowIndex) ?? fail("Row not found");

	return (
		<TableRow
			key={row.id}
			draggable
			onDragStart={() => onRowDragStart(rowIndex)}
			onDragOver={onRowDragOver}
			onDrop={() => onRowDrop(rowIndex)}
			className={`custom-table-row ${rowIndex % 2 === 0 ? "even" : "odd"}`}
		>
			<TableCell className="custom-cell id-cell">
				<span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
					<Button
						appearance="subtle"
						size="small"
						onClick={() => table.removeRows(rowIndex, 1)}
						icon={<Delete24Regular />}
						style={{ padding: 0, minWidth: "auto" }}
					/>
				</span>
			</TableCell>
			{table.columns.map((column) => {
				const cell = table.getCell({
					column,
					row,
				});
				const hint = column.props?.hint ?? "text";

				return (
					<TableCell key={column.id} className="custom-cell">
						<TableCellView
							cell={cell}
							hint={hint}
							onUpdateCell={(newValue) =>
								table.setCell({
									key: {
										column,
										row,
									},
									cell: newValue,
								})
							}
						/>
					</TableCell>
				);
			})}
		</TableRow>
	);
};

interface TableCellViewProps {
	readonly cell: string | undefined;
	readonly hint: string | undefined;
	onUpdateCell: (newValue: string) => void;
}

const TableCellView: React.FC<TableCellViewProps> = ({ cell, hint, onUpdateCell }) => {
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
		}
		default: {
			throw new Error(`Unsupported cell hint: ${hint}`);
		}
	}
};

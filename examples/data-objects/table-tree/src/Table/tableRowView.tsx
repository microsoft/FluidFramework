/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TableRow, TableCell, Input, Button, Checkbox } from "@fluentui/react-components";
import { Delete24Regular } from "@fluentui/react-icons";
import React from "react";

import { TableRowViewProps } from "./tablePropTypes.js";
import { DateTime } from "./tableSchema.js";

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
			const hint = col.props.hint;

			return (
				<TableCell key={col.id} className="custom-cell">
					{hint === "checkbox" ? (
						<Checkbox
							checked={cell?.value === "true"}
							onChange={(_, data) => {
								const newValue = data.checked?.toString() ?? "false";
								if (cell === undefined) {
									row.setCell(col, { value: newValue });
								} else {
									cell.value = newValue;
								}
							}}
						/>
					) : hint === "date" ? (
						<Input
							type="date"
							className="custom-input"
							value={
								cell?.value instanceof DateTime
									? cell.value.value.toISOString().split("T")[0]
									: ""
							}
							onChange={(e) => {
								const date = new Date(e.target.value);
								if (cell === undefined) {
									const dateObj = new DateTime({ raw: 0 });
									dateObj.value = date;
									row.setCell(col, { value: dateObj });
								} else if (cell.value instanceof DateTime) {
									cell.value.value = date;
								}
							}}
						/>
					) : (
						<Input
							type="text"
							appearance="underline"
							className="custom-input"
							value={typeof cell?.value === "string" ? cell.value : ""}
							onChange={(e) => {
								const newVal = e.target.value;
								if (cell === undefined) {
									row.setCell(col, { value: newVal });
								} else {
									cell.value = newVal;
								}
							}}
						/>
					)}
				</TableCell>
			);
		})}
	</TableRow>
);

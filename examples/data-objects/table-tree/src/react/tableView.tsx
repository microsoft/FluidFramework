/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Table, TableBody, Button } from "@fluentui/react-components";
import { Add24Regular } from "@fluentui/react-icons";
import React, { useState, DragEvent } from "react";

import { TableDataObject } from "../dataObject.js";
import { Column, Row } from "../schema.js";

import { TableHeaderView } from "./tableHeaderView.js";
import { TableRowView } from "./tableRowView.js";
import { useTree } from "./utilities.js";

// eslint-disable-next-line import/no-unassigned-import
import "./tableView.css";

/**
 * `TableView` is the main React component responsible for rendering a collaborative,
 * dynamic table with {@link TableDataObject} sd the underlying data object.
 *
 * This component supports:
 * - Realtime editing of table cells
 * - Adding and removing rows and columns
 * - Drag-and-drop reordering of rows and columns
 * - Type-specific cell rendering (e.g., checkbox, date, text)
 *
 * UI is composed using Fluent UI components and synchronized via Fluid's SharedTree.
 *
 * @param tableModel - The table data object containing rows, columns, and cell content using {@link SharedTree}.
 *
 * @remarks
 * - Column properties such as `label` and `hint` (e.g., `"checkbox"`, `"text"`, `"date"`) from the columns
 * are used to determine how each cell is rendered.
 */
export const TableView: React.FC<{ tableModel: TableDataObject }> = ({ tableModel }) => {
	const [draggedRowIndex, setDraggedRowIndex] = useState<number | undefined>(undefined);
	const [draggedColumnIndex, setDraggedColumnIndex] = useState<number | undefined>(undefined);

	const table = tableModel.treeView.root;

	useTree(table);

	const columns = [...table.columns];
	const rows = [...table.rows];

	const handleAppendNewRow = (): void => {
		table.insertRows({
			rows: [new Row({ cells: {} })],
		});
	};

	const handleRemoveRow = (index: number): void => {
		if (index >= 0 && index < rows.length) {
			// TODO: use index-based removal API once that has been added.
			table.removeRows([table.rows[index]]);
		}
	};

	const handleAppendNewColumn = (newColumn: Column): void => {
		table.insertColumns({
			columns: [newColumn],
		});
	};

	const handleRemoveColumn = (index: number): void => {
		if (index >= 0 && index < columns.length) {
			// TODO: use index-based removal API once that has been added.
			table.removeColumns([table.columns[index]]);
		}
	};

	const handleRowDragStart = (index: number): void => {
		setDraggedRowIndex(index);
	};

	const handleRowDragOver = (event: DragEvent<HTMLTableRowElement>): void => {
		event.preventDefault();
	};

	const handleRowDrop = (targetIndex: number): void => {
		if (draggedRowIndex !== undefined && draggedRowIndex !== targetIndex) {
			const destinationGap = draggedRowIndex < targetIndex ? targetIndex + 1 : targetIndex;
			table.rows.moveToIndex(destinationGap, draggedRowIndex);
		}
		setDraggedRowIndex(undefined);
	};

	const handleColumnDragStart = (index: number): void => {
		setDraggedColumnIndex(index);
	};

	const handleColumnDragOver = (event: DragEvent<HTMLTableHeaderCellElement>): void => {
		event.preventDefault();
	};

	const handleColumnDrop = (targetIndex: number): void => {
		if (draggedColumnIndex !== undefined && draggedColumnIndex !== targetIndex) {
			const destinationGap = draggedColumnIndex < targetIndex ? targetIndex + 1 : targetIndex;
			table.columns.moveToIndex(destinationGap, draggedColumnIndex);
		}
		setDraggedColumnIndex(undefined);
	};

	return (
		<div className="table-container">
			<h2 className="table-title">Shared Table</h2>
			<div className="table-scroll">
				<Table aria-label="Fluid-based dynamic table" className="custom-table">
					<TableHeaderView
						columns={columns}
						onColumnDragStart={handleColumnDragStart}
						onColumnDragOver={handleColumnDragOver}
						onColumnDrop={handleColumnDrop}
						onRemoveColumn={handleRemoveColumn}
						handleAppendColumn={handleAppendNewColumn}
					/>
					<TableBody>
						{rows.map((row, index) => (
							<TableRowView
								key={row.id}
								row={row}
								columns={columns}
								index={index}
								onRowDragStart={handleRowDragStart}
								onRowDragOver={handleRowDragOver}
								onRowDrop={handleRowDrop}
								onRemoveRow={handleRemoveRow}
							/>
						))}
					</TableBody>
				</Table>
			</div>
			<Button
				icon={<Add24Regular />}
				appearance="subtle"
				size="small"
				onClick={() => handleAppendNewRow()}
				className="add-row-toggle"
			>
				Add Row
			</Button>
		</div>
	);
};

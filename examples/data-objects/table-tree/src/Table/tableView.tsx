/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Table, TableBody, Input, Button } from "@fluentui/react-components";
import { Add24Regular, Checkmark24Regular } from "@fluentui/react-icons";
import React, { useState, DragEvent } from "react";

import { useTree } from "../utils/index.js";

import { TableHeaderView } from "./tableHeaderView.js";
import { TableRowView } from "./tableRowView.js";

import { TableDataObject } from "./index.js";

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
	const [newRowId, setNewRowId] = useState("");
	const [newColumnId, setNewColumnId] = useState("");
	const [newColumnHint, setNewColumnHint] = useState("");
	const [showAddRowInput, setShowAddRowInput] = useState(false);
	const [showAddColumnInput, setShowAddColumnInput] = useState(false);
	const [draggedRowIndex, setDraggedRowIndex] = useState<number | undefined>(undefined);
	const [draggedColumnIndex, setDraggedColumnIndex] = useState<number | undefined>(undefined);

	useTree(tableModel.treeView.root);

	const columns = [...tableModel.treeView.root.columns];
	const rows = [...tableModel.treeView.root.rows];

	const handleAddRow = (): void => {
		if (newRowId.trim() !== "") {
			tableModel.treeView.root.insertRows({
				index: rows.length,
				rows: [{ id: newRowId.trim(), cells: {}, props: {} }],
			});
			setNewRowId("");
			setShowAddRowInput(false);
		}
	};

	const handleRemoveRow = (index: number): void => {
		if (index >= 0 && index < rows.length) {
			tableModel.treeView.root.rows.removeAt(index);
		}
	};

	const handleAddColumn = (): void => {
		if (newColumnId.trim() !== "") {
			tableModel.treeView.root.insertColumn({
				index: 0,
				column: {
					props: {
						label: newColumnId,
						hint: newColumnHint || undefined,
					},
				},
			});
			setNewColumnId("");
			setNewColumnHint("");
			setShowAddColumnInput(false);
		}
	};

	const handleRemoveColumn = (index: number): void => {
		if (index >= 0 && index < columns.length) {
			tableModel.treeView.root.columns.removeAt(index);
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
			tableModel.treeView.root.rows.moveToIndex(destinationGap, draggedRowIndex);
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
			tableModel.treeView.root.columns.moveToIndex(destinationGap, draggedColumnIndex);
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
						showAddColumnInput={showAddColumnInput}
						setShowAddColumnInput={setShowAddColumnInput}
						newColumnId={newColumnId}
						setNewColumnId={setNewColumnId}
						newColumnHint={newColumnHint}
						setNewColumnHint={setNewColumnHint}
						handleAddColumn={handleAddColumn}
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
			{showAddRowInput ? (
				<div className="add-row-container">
					<Input
						type="text"
						placeholder="Row ID"
						value={newRowId}
						onChange={(e) => setNewRowId(e.target.value)}
						size="small"
						className="add-row-input"
					/>
					<Button
						icon={<Checkmark24Regular />}
						appearance="subtle"
						size="small"
						onClick={handleAddRow}
					/>
				</div>
			) : (
				<Button
					icon={<Add24Regular />}
					appearance="subtle"
					size="small"
					onClick={() => setShowAddRowInput(true)}
					className="add-row-toggle"
				>
					Add Row
				</Button>
			)}
		</div>
	);
};

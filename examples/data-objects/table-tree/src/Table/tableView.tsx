/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Table, TableBody, Input, Button } from "@fluentui/react-components";
import { Add24Regular, Checkmark24Regular } from "@fluentui/react-icons";
import React, { useState, DragEvent } from "react";

import { useTree } from "../Utils/index.js";

import { TableHeaderView } from "./tableHeaderView.js";
import { TableRowView } from "./tableRowView.js";

import { TableDataObject } from "./index.js";

// eslint-disable-next-line import/no-unassigned-import
import "./tableView.css";

export const TableView: React.FC<{ tableModel: TableDataObject }> = ({ tableModel }) => {
	const [newRowId, setNewRowId] = useState("");
	const [newColumnId, setNewColumnId] = useState("");
	const [newColumnHint, setNewColumnHint] = useState("");
	const [showAddRowInput, setShowAddRowInput] = useState(false);
	const [showAddColumnInput, setShowAddColumnInput] = useState(false);
	const [draggedRowIndex, setDraggedRowIndex] = useState<number | null>(null);
	const [draggedColumnIndex, setDraggedColumnIndex] = useState<number | null>(null);

	useTree(tableModel.treeView.root);

	const columns = Array.from(tableModel.treeView.root.columns);
	const rows = Array.from(tableModel.treeView.root.rows);

	const handleAddRow = () => {
		if (newRowId.trim() !== "") {
			tableModel.treeView.root.insertRows({
				index: rows.length,
				rows: [{ id: newRowId.trim(), cells: {}, props: {} }],
			});
			setNewRowId("");
			setShowAddRowInput(false);
		}
	};

	const handleRemoveRow = (index: number) => {
		if (index >= 0 && index < rows.length) {
			tableModel.treeView.root.rows.removeAt(index);
		}
	};

	const handleAddColumn = () => {
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

	const handleRemoveColumn = (index: number) => {
		if (index >= 0 && index < columns.length) {
			tableModel.treeView.root.columns.removeAt(index);
		}
	};

	const handleRowDragStart = (index: number) => {
		setDraggedRowIndex(index);
	};

	const handleRowDragOver = (event: DragEvent<HTMLTableRowElement>) => {
		event.preventDefault();
	};

	const handleRowDrop = (targetIndex: number) => {
		if (draggedRowIndex !== null && draggedRowIndex !== targetIndex) {
			const destinationGap = draggedRowIndex < targetIndex ? targetIndex + 1 : targetIndex;
			tableModel.treeView.root.rows.moveToIndex(destinationGap, draggedRowIndex);
		}
		setDraggedRowIndex(null);
	};

	const handleColumnDragStart = (index: number) => {
		setDraggedColumnIndex(index);
	};

	const handleColumnDragOver = (event: DragEvent<HTMLTableHeaderCellElement>) => {
		event.preventDefault();
	};

	const handleColumnDrop = (targetIndex: number) => {
		if (draggedColumnIndex !== null && draggedColumnIndex !== targetIndex) {
			const destinationGap = draggedColumnIndex < targetIndex ? targetIndex + 1 : targetIndex;
			tableModel.treeView.root.columns.moveToIndex(destinationGap, draggedColumnIndex);
		}
		setDraggedColumnIndex(null);
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

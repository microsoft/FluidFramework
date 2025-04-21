/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Table,
	TableBody,
	TableCell,
	TableHeader,
	TableHeaderCell,
	TableRow,
	Input,
	Button,
} from "@fluentui/react-components";
import React, { useState, DragEvent } from "react";

import { useTree } from "../Utils/index.js";

import { Column, Row } from "./tableSchema.js";

import { type TableDataObject } from "./index.js";

// eslint-disable-next-line import/no-unassigned-import
import "./tableView.css";

export interface TableProps {
	readonly tableModel: TableDataObject;
}

interface TableRowViewProps {
	row: Row;
	columns: Column[];
	index: number;
	onDragStart: (index: number) => void;
	onDragOver: (event: DragEvent<HTMLTableRowElement>) => void;
	onDrop: (index: number) => void;
}

const TableRowView: React.FC<TableRowViewProps> = ({
	row,
	columns,
	index,
	onDragStart,
	onDragOver,
	onDrop,
}) => {
	return (
		<TableRow
			key={row.id}
			draggable
			onDragStart={() => onDragStart(index)}
			onDragOver={onDragOver}
			onDrop={() => onDrop(index)}
			className={`custom-table-row ${index % 2 === 0 ? "even" : "odd"}`}
		>
			<TableCell className="custom-cell id-cell">{row.id}</TableCell>
			{columns.map((col) => {
				const cell = row.getCell(col);
				return (
					<TableCell key={col.id} className="custom-cell">
						<Input
							type="text"
							appearance="underline"
							className="custom-input"
							value={cell?.value ?? ""}
							onChange={(e) => {
								if (cell === undefined) {
									row.setCell(col, { value: e.target.value });
								} else {
									cell.value = e.target.value;
								}
							}}
						/>
					</TableCell>
				);
			})}
		</TableRow>
	);
};

const TableHeaderView: React.FC<{ columns: Column[] }> = ({ columns }) => (
	<TableHeader>
		<TableRow className="custom-header-row">
			<TableHeaderCell className="custom-header-cell">ID</TableHeaderCell>
			{columns.map((col) => (
				<TableHeaderCell key={col.id} className="custom-header-cell">
					{col.id}
				</TableHeaderCell>
			))}
		</TableRow>
	</TableHeader>
);

export const TableView: React.FC<TableProps> = ({ tableModel }) => {
	const [newRowId, setNewRowId] = useState("");
	const [draggedRowIndex, setDraggedRowIndex] = useState<number | null>(null);

	useTree(tableModel.treeView.root);

	const columns = Array.from(tableModel.treeView.root.columns);
	const rows = Array.from(tableModel.treeView.root.rows);

	const handleAddRow = () => {
		if (newRowId.trim() !== "") {
			tableModel.treeView.root.insertRows({
				rows: [
					{
						id: newRowId.trim(),
						cells: {},
					},
				],
			});
			setNewRowId("");
		}
	};

	const handleDragStart = (index: number) => {
		setDraggedRowIndex(index);
	};

	const handleDragOver = (event: DragEvent<HTMLTableRowElement>) => {
		event.preventDefault();
	};

	const handleDrop = (targetIndex: number) => {
		if (draggedRowIndex !== null && draggedRowIndex !== targetIndex) {
			// When dragging downwards, inserting after target requires adding +1 to the gap,
			// because the source is removed before being re-inserted
			const destinationGap = draggedRowIndex < targetIndex ? targetIndex + 1 : targetIndex;
			tableModel.treeView.root.rows.moveToIndex(destinationGap, draggedRowIndex);
		}
		setDraggedRowIndex(null);
	};

	return (
		<div className="table-container">
			<h2 className="table-title">Shared Table</h2>

			<Table aria-label="Fluid-based dynamic table" className="custom-table">
				<TableHeaderView columns={columns} />
				<TableBody>
					{rows.map((row, index) => (
						<TableRowView
							key={row.id}
							row={row}
							columns={columns}
							index={index}
							onDragStart={handleDragStart}
							onDragOver={handleDragOver}
							onDrop={handleDrop}
						/>
					))}
				</TableBody>
			</Table>

			<div className="add-row-container">
				<Input
					type="text"
					placeholder="Enter new row ID"
					value={newRowId}
					onChange={(e) => setNewRowId(e.target.value)}
					className="add-row-input"
				/>
				<Button appearance="primary" onClick={handleAddRow} disabled={newRowId.trim() === ""}>
					Add Row
				</Button>
			</div>
		</div>
	);
};

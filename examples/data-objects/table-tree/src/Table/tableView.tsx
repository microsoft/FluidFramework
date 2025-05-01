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
	Checkbox,
	Dropdown,
	Option,
} from "@fluentui/react-components";
import { Add24Regular, Delete24Regular, Checkmark24Regular } from "@fluentui/react-icons";
import React, { useState, DragEvent } from "react";

import { useTree } from "../Utils/index.js";

import { Column, Row, DateTime } from "./tableSchema.js";

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
	onRowDragStart: (index: number) => void;
	onRowDragOver: (event: DragEvent<HTMLTableRowElement>) => void;
	onRowDrop: (index: number) => void;
	onRemoveRow: (index: number) => void;
}

const TableRowView: React.FC<TableRowViewProps> = ({
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

interface TableHeaderViewProps {
	columns: Column[];
	onColumnDragStart: (index: number) => void;
	onColumnDragOver: (event: DragEvent<HTMLTableHeaderCellElement>) => void;
	onColumnDrop: (index: number) => void;
	onRemoveColumn: (index: number) => void;
	showAddColumnInput: boolean;
	setShowAddColumnInput: (value: boolean) => void;
	newColumnId: string;
	setNewColumnId: (id: string) => void;
	newColumnHint: string;
	setNewColumnHint: (hint: string) => void;
	handleAddColumn: () => void;
}

const TableHeaderView: React.FC<TableHeaderViewProps> = ({
	columns,
	onColumnDragStart,
	onColumnDragOver,
	onColumnDrop,
	onRemoveColumn,
	showAddColumnInput,
	setShowAddColumnInput,
	newColumnId,
	setNewColumnId,
	newColumnHint,
	setNewColumnHint,
	handleAddColumn,
}) => (
	<TableHeader>
		{showAddColumnInput && (
			<TableRow className="custom-header-row">
				<TableHeaderCell colSpan={columns.length + 1}>
					<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
						<Input
							type="text"
							placeholder="Column Label"
							value={newColumnId}
							onChange={(e) => setNewColumnId(e.target.value)}
							size="small"
						/>
						<Dropdown
							placeholder="Select hint"
							value={newColumnHint}
							onOptionSelect={(_, data) => setNewColumnHint(data.optionValue ?? "")}
							size="small"
						>
							<Option value="text">Text</Option>
							<Option value="checkbox">Checkbox</Option>
							<Option value="date">Date</Option>
						</Dropdown>
						<Button
							icon={<Checkmark24Regular />}
							appearance="subtle"
							size="small"
							onClick={handleAddColumn}
						/>
					</div>
				</TableHeaderCell>
			</TableRow>
		)}
		<TableRow className="custom-header-row">
			<TableHeaderCell className="custom-header-cell">
				<Button
					icon={<Add24Regular />}
					appearance="subtle"
					size="small"
					onClick={() => setShowAddColumnInput(true)}
				/>
			</TableHeaderCell>
			{columns.map((col, index) => (
				<TableHeaderCell
					key={col.id}
					className="custom-header-cell"
					draggable
					onDragStart={() => onColumnDragStart(index)}
					onDragOver={onColumnDragOver}
					onDrop={() => onColumnDrop(index)}
				>
					<span
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							gap: "4px",
						}}
					>
						{col.props.label}
						<Button
							appearance="subtle"
							size="small"
							onClick={() => onRemoveColumn(index)}
							icon={<Delete24Regular />}
							style={{ padding: 0, minWidth: "auto" }}
						/>
					</span>
				</TableHeaderCell>
			))}
		</TableRow>
	</TableHeader>
);

export const TableView: React.FC<TableProps> = ({ tableModel }) => {
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
				rows: [
					{
						id: newRowId.trim(),
						cells: {},
						props: {},
					},
				],
			});
			setNewRowId("");
			setShowAddRowInput(false);
		}
	};

	const handleRemoveRow = (index: number) => {
		if (rows[index] !== undefined) {
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
		if (columns[index] !== undefined) {
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

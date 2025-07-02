/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	TableHeader,
	TableRow,
	TableHeaderCell,
	Input,
	Button,
	Dropdown,
	Option,
} from "@fluentui/react-components";
import { Add24Regular, Checkmark24Regular, Delete24Regular } from "@fluentui/react-icons";
import React, { DragEvent, useState } from "react";

import { Column } from "../schema.js";

/**
 * Props for the `TableHeaderView` component, which renders the header row of the table.
 *
 * This includes support for drag-and-drop column reordering, column removal, and an inline form
 * to add new columns with optional metadata such as label and hint.
 */
export interface TableHeaderViewProps {
	/**
	 * The list of columns currently present in the table.
	 */
	readonly columns: Column[];

	/**
	 * Callback fired when a column drag operation starts. Receives the index of the dragged column.
	 */
	onColumnDragStart: (index: number) => void;

	/**
	 * Callback fired when a dragged column is hovered over a header cell.
	 */
	onColumnDragOver: (event: DragEvent<HTMLTableHeaderCellElement>) => void;

	/**
	 * Callback fired when a dragged column is dropped onto another column's position.
	 * Receives the target index to reposition the dragged column.
	 */
	onColumnDrop: (index: number) => void;

	/**
	 * Callback to remove a column from the table. Receives the index of the column to remove.
	 */
	onRemoveColumn: (index: number) => void;

	/**
	 * Handler invoked when the user confirms adding a new column.
	 */
	handleAppendColumn: (newColumn: Column) => void;
}

/**
 * `TableHeaderView` renders the header section of the table.
 *
 * It includes:
 * - A row of column headers with labels and delete buttons
 * - Support for drag-and-drop reordering of columns
 * - An optional input row to add new columns, including label and hint type
 *
 * @param props - The props required to render and manage the table header view.
 * @returns A React element representing the table header.
 */
export const TableHeaderView: React.FC<TableHeaderViewProps> = ({
	columns,
	onColumnDragStart,
	onColumnDragOver,
	onColumnDrop,
	onRemoveColumn,
	handleAppendColumn,
}) => {
	const [newColumnLabel, setNewColumnLabel] = useState("");
	const [newColumnHint, setNewColumnHint] = useState("");
	const [showAddColumnInput, setShowAddColumnInput] = useState(false);

	const handleChangeColumnHint = (index: number, hint: string): void => {
		const column = columns[index];
		if (column?.props !== undefined && column.getCells().length === 0) {
			column.props.hint = hint;
		}
	};

	return (
		<TableHeader>
			{showAddColumnInput && (
				<TableRow className="custom-header-row">
					<TableHeaderCell colSpan={columns.length + 1}>
						<div style={{ display: "flex", gap: "8px" }}>
							<Input
								type="text"
								placeholder="Column Label"
								value={newColumnLabel}
								onChange={(e) => setNewColumnLabel(e.target.value)}
								size="small"
							/>
							<Dropdown
								placeholder="Select hint"
								value={newColumnHint}
								onOptionSelect={(_, data) => {
									if (data.optionValue !== undefined) {
										setNewColumnHint(data.optionValue);
									}
								}}
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
								onClick={() => {
									handleAppendColumn(
										new Column({
											props: {
												label: newColumnLabel,
												hint: newColumnHint,
											},
										}),
									);
								}}
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
						<div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
							<div style={{ display: "flex", gap: "4px", width: "100%" }}>
								<span style={{ wordBreak: "break-word" }}>{col.props?.label ?? col.id}</span>
								<Button
									appearance="subtle"
									size="small"
									onClick={() => onRemoveColumn(index)}
									icon={<Delete24Regular />}
									style={{ padding: 0, minWidth: "auto" }}
								/>
							</div>
							<Dropdown
								placeholder="Type"
								value={col.props?.hint ?? ""}
								onOptionSelect={(_, data) => {
									if (data.optionValue !== undefined) {
										handleChangeColumnHint(index, data.optionValue);
									}
								}}
								disabled={col.getCells().length > 0}
								size="small"
								style={{ marginTop: "4px" }}
							>
								<Option value="text">Text</Option>
								<Option value="checkbox">Checkbox</Option>
								<Option value="date">Date</Option>
							</Dropdown>
						</div>
					</TableHeaderCell>
				))}
			</TableRow>
		</TableHeader>
	);
};

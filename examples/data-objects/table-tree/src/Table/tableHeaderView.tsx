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
import React, { DragEvent } from "react";

import type { Column } from "./tableSchema.js";

export interface TableHeaderViewProps {
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

export const TableHeaderView: React.FC<TableHeaderViewProps> = ({
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
					<span style={{ display: "flex", justifyContent: "space-between", gap: "4px" }}>
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

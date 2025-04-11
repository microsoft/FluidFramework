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
} from "@fluentui/react-components";
import React from "react";

// eslint-disable-next-line import/no-unassigned-import
import "./style.css";

import { useTree } from "../Utils/index.js";

import type { Column, Row } from "./tableSchema.js";

import { type TableDataObject } from "./index.js";

export interface TableProps {
	readonly tableModel: TableDataObject;
}

interface TableRowViewProps {
	row: Row;
	columns: Column[];
}

const TableRowView: React.FC<TableRowViewProps> = ({ row, columns }) => {
	return (
		<TableRow key={row.id}>
			<TableCell>{row.id}</TableCell>
			{columns.map((col) => {
				const cell = row.getCell(col);
				return (
					<TableCell key={col.id}>
						<Input
							type="text"
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

interface TableHeaderViewProps {
	columns: Column[];
}

const TableHeaderView: React.FC<TableHeaderViewProps> = ({ columns }) => {
	return (
		<TableHeader>
			<TableRow>
				<TableHeaderCell>ID</TableHeaderCell>
				{columns.map((col) => (
					<TableHeaderCell key={col.id}>{col.id}</TableHeaderCell>
				))}
			</TableRow>
		</TableHeader>
	);
};

export const TableView: React.FC<TableProps> = (props: TableProps) => {
	const { tableModel } = props;

	useTree(tableModel.treeView.root);

	const columns = Array.from(tableModel.treeView.root.columns);
	const rows = Array.from(tableModel.treeView.root.rows);

	return (
		<div className="todo-view">
			<Table aria-label="Fluid-based dynamic table">
				<TableHeaderView columns={columns} />
				<TableBody>
					{rows.map((row) => (
						<TableRowView key={row.id} row={row} columns={columns} />
					))}
				</TableBody>
			</Table>
		</div>
	);
};

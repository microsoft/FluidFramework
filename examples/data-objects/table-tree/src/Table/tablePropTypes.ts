/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DragEvent } from "react";

import { Column, Row } from "./tableSchema.js";

export interface TableRowViewProps {
	row: Row;
	columns: Column[];
	index: number;
	onRowDragStart: (index: number) => void;
	onRowDragOver: (event: DragEvent<HTMLTableRowElement>) => void;
	onRowDrop: (index: number) => void;
	onRemoveRow: (index: number) => void;
}

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

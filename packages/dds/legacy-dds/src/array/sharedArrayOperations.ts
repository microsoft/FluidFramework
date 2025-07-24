/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @legacy
 * @alpha
 */
export const OperationType = {
	insertEntry: 0,
	deleteEntry: 1,
	moveEntry: 2,
	toggle: 3,
	toggleMove: 4,
} as const;

/**
 * @legacy
 * @alpha
 */
export type OperationType = (typeof OperationType)[keyof typeof OperationType];

/**
 * @legacy
 * @alpha
 */
export interface IInsertOperation<T = unknown> {
	type: typeof OperationType.insertEntry;
	entryId: string;
	value: T;
	insertAfterEntryId?: string;
}

/**
 * @legacy
 * @alpha
 */
export interface IDeleteOperation {
	type: typeof OperationType.deleteEntry;
	entryId: string;
}

/**
 * @legacy
 * @alpha
 */
export interface IMoveOperation {
	type: typeof OperationType.moveEntry;
	entryId: string;
	insertAfterEntryId?: string;
	changedToEntryId: string;
}

/**
 * @legacy
 * @alpha
 */
export interface IToggleOperation {
	type: typeof OperationType.toggle;
	entryId: string;
	isDeleted: boolean;
}

/**
 * @legacy
 * @alpha
 */
export interface IToggleMoveOperation {
	type: typeof OperationType.toggleMove;
	entryId: string;
	changedToEntryId: string;
}

/**
 * @legacy
 * @alpha
 */
export type ISharedArrayRevertibleOperation = IToggleOperation | IToggleMoveOperation;

/**
 * @legacy
 * @alpha
 */
export type ISharedArrayOperation<T = unknown> =
	| IInsertOperation<T>
	| IDeleteOperation
	| IMoveOperation
	| ISharedArrayRevertibleOperation;

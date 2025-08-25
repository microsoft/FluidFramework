/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @legacy @beta
 */
export const OperationType = {
	insertEntry: 0,
	deleteEntry: 1,
	moveEntry: 2,
	toggle: 3,
	toggleMove: 4,
} as const;

/**
 * @legacy @beta
 */
export type OperationType = (typeof OperationType)[keyof typeof OperationType];

/**
 * @legacy @beta
 */
export interface IInsertOperation<T = unknown> {
	type: typeof OperationType.insertEntry;
	entryId: string;
	value: T;
	insertAfterEntryId?: string;
}

/**
 * @legacy @beta
 */
export interface IDeleteOperation {
	type: typeof OperationType.deleteEntry;
	entryId: string;
}

/**
 * @legacy @beta
 */
export interface IMoveOperation {
	type: typeof OperationType.moveEntry;
	entryId: string;
	insertAfterEntryId?: string;
	changedToEntryId: string;
}

/**
 * @legacy @beta
 */
export interface IToggleOperation {
	type: typeof OperationType.toggle;
	entryId: string;
	isDeleted: boolean;
}

/**
 * @legacy @beta
 */
export interface IToggleMoveOperation {
	type: typeof OperationType.toggleMove;
	entryId: string;
	changedToEntryId: string;
}

/**
 * @legacy @beta
 */
export type ISharedArrayRevertibleOperation = IToggleOperation | IToggleMoveOperation;

/**
 * @legacy @beta
 */
export type ISharedArrayOperation<T = unknown> =
	| IInsertOperation<T>
	| IDeleteOperation
	| IMoveOperation
	| ISharedArrayRevertibleOperation;

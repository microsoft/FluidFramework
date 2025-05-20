/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @internal
 */
export const OperationType = {
	insertEntry: 0,
	deleteEntry: 1,
	moveEntry: 2,
	toggle: 3,
	toggleMove: 4,
} as const;

/**
 * @internal
 */
export type OperationType = (typeof OperationType)[keyof typeof OperationType];

/**
 * @internal
 */
export interface IInsertOperation<T = unknown> {
	type: typeof OperationType.insertEntry;
	entryId: string;
	value: T;
	insertAfterEntryId?: string;
}

/**
 * @internal
 */
export interface IDeleteOperation {
	type: typeof OperationType.deleteEntry;
	entryId: string;
}

/**
 * @internal
 */
export interface IMoveOperation {
	type: typeof OperationType.moveEntry;
	entryId: string;
	insertAfterEntryId?: string;
	changedToEntryId: string;
}

/**
 * @internal
 */
export interface IToggleOperation {
	type: typeof OperationType.toggle;
	entryId: string;
	isDeleted: boolean;
}

/**
 * @internal
 */
export interface IToggleMoveOperation {
	type: typeof OperationType.toggleMove;
	entryId: string;
	changedToEntryId: string;
}

type ISharedArrayRevertibleOperation = IToggleOperation | IToggleMoveOperation;

/**
 * @internal
 */
export type ISharedArrayOperation<T = unknown> =
	| IInsertOperation<T>
	| IDeleteOperation
	| IMoveOperation
	| ISharedArrayRevertibleOperation;

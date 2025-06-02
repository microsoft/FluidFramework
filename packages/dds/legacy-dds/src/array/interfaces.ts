/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IEventThisPlaceHolder, IFluidHandle } from "@fluidframework/core-interfaces";
import type { Serializable } from "@fluidframework/datastore-definitions/internal";
import type {
	ISharedObjectEvents,
	ISharedObject,
	SharedObject,
} from "@fluidframework/shared-object-base/internal";

import type { ISharedArrayOperation } from "./sharedArrayOperations.js";
/**
 * Basic types for the SharedArray DDS
 * It can be used as a generic constraint (`extends SerializableTypeForSharedArray`) but is
 * *never* meant to be a concrete/real type on its own.
 *
 * @legacy
 * @alpha
 */
export type SerializableTypeForSharedArray = boolean | number | string | object | IFluidHandle;

/**
 *
 * @typeParam T - The type of the object to make readonly
 *
 * @legacy
 * @alpha
 */
export type FullyReadonly<T> = {
	readonly [P in keyof T]: FullyReadonly<T[P]>;
};

/**
 * Interface defining the events that can be emitted by the SharedArray DDS
 * and the events that can be listened to by the SharedArray DDS
 *
 * @legacy
 * @alpha
 */
export interface ISharedArrayEvents extends ISharedObjectEvents {
	(
		event: "valueChanged",
		listener: (
			op: ISharedArrayOperation,
			isLocal: boolean,
			target: IEventThisPlaceHolder,
		) => void,
	): void;

	(event: "revertible", listener: (revertible: IRevertible) => void): void;
}

/**
 * Interface defining the SharedArray DDS
 * It is a generic interface that can be used to create a SharedArray of any type
 * The type of the SharedArray is defined by the type parameter T
 *
 * @typeParam T - The type of the SharedArray
 *
 * @legacy
 * @alpha
 */
export interface ISharedArray<T extends SerializableTypeForSharedArray>
	extends SharedObject<ISharedArrayEvents> {
	get(): FullyReadonly<T[]>;
	insert<TWrite>(index: number, value: Serializable<TWrite> & T): void;
	delete(index: number): void;
	move(oldIndex: number, newIndex: number): void;
	toggle(entryId: string): void;
	toggleMove(oldEntryId: string, newEntryId: string): void;
}

/**
 *
 * @internal
 */
export interface ISharedArrayRevertible extends ISharedObject<ISharedArrayEvents> {
	toggle(entryId: string): void;
	toggleMove(oldEntryId: string, newEntryId: string): void;
}

/**
 * Interface defining the in memory shared array entry of the DDS
 *
 * @internal
 */
export interface SharedArrayEntry<T extends SerializableTypeForSharedArray>
	extends SharedArrayEntryCore<T> {
	/**
	 * Flag that tracks whether an ack from the server has been received for a local insert.
	 * True for local changes.
	 */
	isAckPending: boolean;

	/**
	 * Counter is shared by delete and undo/redo (of delete and insert) as undo/redo simply
	 * operates on the isDeleted flag of the DDS. This flag will help us skip local op acks as
	 * they have already inflicted state change. The flag helps us ignore remote ops if there is a
	 * local pending delete as we would be getting the pending op after server stamping
	 */
	isLocalPendingDelete: number;

	/**
	 * Counter is for move and its undo/redo. This flag will be used to skip local op acks as
	 * they have already inflicted state change. The flag helps us ignore remote ops if there is a
	 * local pending delete as we would be getting the pending op after server stamping. Only exception
	 * being if there is a remote delete, we will have to respect that
	 */
	isLocalPendingMove: number;
}

/**
 * Interface defining the core entry attributes
 *
 * @internal
 */
export interface SharedArrayEntryCore<T extends SerializableTypeForSharedArray> {
	/**
	 * a unique ID for this particular entry
	 */
	entryId: string;

	/**
	 * the value stored in this entry, may not be unique
	 */
	value: T;

	/**
	 * Flag to track whether this entry is deleted or not.
	 */
	isDeleted: boolean;

	/**
	 * Primarily used for move op and tracks the old entry id from which this entry was changed from.
	 */
	prevEntryId?: string;

	/**
	 * Primarily used for move op and tracks the new entry id to which this entry was changed to.
	 */
	nextEntryId?: string;
}

/**
 * Format of the snapshot for the DDS
 *
 * @internal
 */
export interface SnapshotFormat<T> {
	/**
	 * Array of the data entries that represent the DDS in-memory representation
	 */
	dataArray: T[];
}

/**
 * @legacy
 * @alpha
 */
export interface IRevertible {
	revert(): void;
	dispose(): void;
}

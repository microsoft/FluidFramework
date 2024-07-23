/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Serializable } from "@fluidframework/datastore-definitions/internal";
import type { AttributionKey } from "@fluidframework/runtime-definitions/internal";
import type {
	ISharedObject,
	ISharedObjectEvents,
} from "@fluidframework/shared-object-base/internal";

/**
 * Events emitted by {@link ISharedCell}.
 * @internal
 */
export interface ISharedCellEvents<T> extends ISharedObjectEvents {
	/**
	 * Emitted when the value has changed.
	 *
	 * @remarks Event paramters:
	 *
	 * - `value`: The new value of the cell.
	 */
	(event: "valueChanged", listener: (value: Serializable<T>) => void);

	/**
	 * Emitted when the value has been deleted.
	 */
	(event: "delete", listener: () => void);
}

/**
 * A Distributed Data Structure (DDS), which stores a single shared value that can be edited or deleted.
 *
 * @typeParam T - The type of cell data. Must be serializable.
 *
 * @example Creation
 *
 * To create a `SharedCell`, call the static create method:
 *
 * ```typescript
 * const myCell = SharedCell.create(this.runtime, id);
 * ```
 *
 * @example Usage
 *
 * The value stored in the cell can be set with the `.set()` method and retrieved with the `.get()` method:
 *
 * ```typescript
 * myCell.set(3);
 * console.log(myCell.get()); // 3
 * ```
 *
 * The value must only be plain JS objects or `SharedObject` handles (e.g. to another DDS or Fluid object).
 * In collaborative scenarios, the value is settled with a policy of _last write wins_.
 *
 * The `.delete()` method will delete the stored value from the cell:
 *
 * ```typescript
 * myCell.delete();
 * console.log(myCell.get()); // undefined
 * ```
 *
 * The `.empty()` method will check if the value is undefined.
 *
 * ```typescript
 * if (myCell.empty()) {
 *   // myCell.get() will return undefined
 * } else {
 *   // myCell.get() will return a non-undefined value
 * }
 * ```
 *
 * @example Eventing
 *
 * `SharedCell` is an `EventEmitter`, and will emit events when other clients make modifications. You should
 * register for these events and respond appropriately as the data is modified. `valueChanged` will be emitted
 * in response to a `set`, and `delete` will be emitted in response to a `delete`.
 * @internal
 */
// TODO: use `unknown` instead (breaking change).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ISharedCell<T = any> extends ISharedObject<ISharedCellEvents<T>> {
	/**
	 * Retrieves the cell value.
	 *
	 * @returns The value of the cell
	 */
	get(): Serializable<T> | undefined;

	/**
	 * Sets the cell value.
	 *
	 * @param value - a JSON-able or SharedObject value to set the cell to
	 */
	set(value: Serializable<T>): void;

	/**
	 * Checks whether cell is empty or not.
	 *
	 * @returns `true` if the value of cell is `undefined`, `false` otherwise
	 */
	empty(): boolean;

	/**
	 * Delete the value from the cell.
	 */
	delete(): void;

	/**
	 * @returns the AttributionKey associated with the cell's most recent change.
	 */
	getAttribution(): AttributionKey | undefined;
}

/**
 * Describes a local Cell operation (op).
 */
// TODO: use `unknown` instead.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ICellLocalOpMetadata<T = any> {
	/**
	 * Unique identifier for this local operation (op).
	 */
	pendingMessageId: number;

	/**
	 * The value of the {@link ISharedCell} prior to this operation (op).
	 */
	previousValue?: Serializable<T>;
}

/**
 * Options related to attribution
 * @internal
 */
export interface ICellOptions {
	attribution?: ICellAttributionOptions;
}

/**
 * This enables the cell to store the attribution information which can be accessed with the runtime
 * (i.e. who creeated the content and when it was created)
 *
 * default: false
 * @internal
 */
export interface ICellAttributionOptions {
	track?: boolean;
}

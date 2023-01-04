/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedObject, ISharedObjectEvents } from "@fluidframework/shared-object-base";
import { Serializable } from "@fluidframework/datastore-definitions";

/**
 * Events emitted by {@link ISharedCell}.
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
 * Distributed Data Structure (DDS), which stores a single shared value that can be edited or deleted.
 */
export interface ISharedCell<T = any> extends ISharedObject<ISharedCellEvents<T>> {
    /**
     * Retrieves the cell value.
     *
     * @returns - the value of the cell
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
     * @returns - `true` if the value of cell is `undefined`, `false` otherwise
     */
    empty(): boolean;

    /**
     * Delete the value from the cell.
     */
    delete(): void;
}
export interface ICellLocalOpMetadata {
    pendingMessageId: number;
    previousValue?: any;
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedObject, ISharedObjectEvents } from "@fluidframework/shared-object-base";
import { Serializable } from "@fluidframework/datastore-definitions";

export interface ISharedCellEvents<T> extends ISharedObjectEvents {
    (event: "valueChanged", listener: (value: Serializable<T>) => void);
    (event: "delete", listener: () => void);
}

/**
 * Shared cell interface
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

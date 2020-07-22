/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedObject, ISharedObjectEvents } from "@fluidframework/shared-object-base";
import { Serializable } from "@fluidframework/component-runtime-definitions";

export interface ISharedCellEvents<T extends Serializable> extends ISharedObjectEvents {
    (event: "valueChanged", listener: (value: T) => void);
    (event: "delete", listener: () => void);
}

/**
 * Shared cell interface
 */

export interface ISharedCell<T extends Serializable = any> extends ISharedObject<ISharedCellEvents<T>> {
    /**
     * Retrieves the cell value.
     *
     * @returns - the value of the cell
     */
    get(): T | undefined;

    /**
     * Sets the cell value.
     *
     * @param value - a JSON-able or SharedObject value to set the cell to
     */
    set(value: T): void;

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

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedObject, ISharedObjectEvents } from "@fluidframework/shared-object-base";

export interface ISharedCellEvents extends ISharedObjectEvents{
    (event: "valueChanged", listener: (value: any) => void);
    (event: "delete", listener: () => void);
}

/**
 * Shared cell interface
 */
export interface ISharedCell extends ISharedObject<ISharedCellEvents> {
    /**
     * Retrieves the cell value.
     *
     * @returns - the value of the cell
     */
    get(): any;

    /**
     * Sets the cell value.
     *
     * @param value - a JSON-able or SharedObject value to set the cell to
     */
    set(value: any): void;

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

/**
 * Shared counter interface
 */
export interface ISharedCounter extends ISharedObject {
    /**
     * The counter value.
     */
    value: number;

    /**
     * Increments or decrements the value.
     *
     * @param incrementAmount - the amount to increment or decrement by
     */
    increment(incrementAmount: number): void;
}

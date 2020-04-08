/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedObject, IEventThisPlaceHolder, ISharedObjectEvents } from "@microsoft/fluid-shared-object-base";

export interface ISharedCellEvents extends ISharedObjectEvents{
    (event: "valueChanged",listener: (target: IEventThisPlaceHolder) => void);
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

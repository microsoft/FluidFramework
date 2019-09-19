/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedObject } from "@microsoft/fluid-shared-object-base";

/**
 * Shared cell interface
 */
export interface ISharedCell extends ISharedObject {
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

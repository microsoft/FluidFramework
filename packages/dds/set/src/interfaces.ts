/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedObject, ISharedObjectEvents } from "@fluidframework/shared-object-base";

export interface ISharedSetEvents<T> extends ISharedObjectEvents {
    (event: "valueChanged" | "delete", listener: (value: T) => void);
    (event: "clear", listener: () => void);
}

/**
 * Shared set interface
 */

export interface ISharedSet<T = any> extends ISharedObject<ISharedSetEvents<T>> {
    /**
     * Retrieves the set value.
     *
     * @returns - the value of the set
     */
    get(): Set<T>;

    /**
     * add the set value.
     *
     * @param value - a JSON-able or SharedObject value to set the set to
     */
    add(value: T): void;

    /**
     * Check if a value exists in the set.
     * @param value - The value to check
     * @returns True if the value exists, false otherwise
     */
    has(value: T): boolean;

    /**
     * Checks whether set is empty or not.
     *
     * @returns - `true` if the value of set is `undefined`, `false` otherwise
     */
    empty(): boolean;

    /**
     * Delete the value from the set.
     * @param value - The value to be deleted
     */
    delete(value: T): void;

    /**
     * Removes all elements from the set.
     */
    clear(): void;
}

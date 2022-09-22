/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedObject, ISharedObjectEvents } from "@fluidframework/shared-object-base";

export interface ISharedSetEvents<T> extends ISharedObjectEvents {
    (event: "valueChanged", listener: (value: Set<T>) => void);
    (event: "delete", listener: () => void);
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
    get(): Map<string, boolean>;

    /**
     * add the set value.
     *
     * @param value - a JSON-able or SharedObject value to set the set to
     */
    add(value: T): void;

    /**
     * Checks whether set is empty or not.
     *
     * @returns - `true` if the value of set is `undefined`, `false` otherwise
     */
    empty(): boolean;

    /**
     * Delete the value from the set.
     */
    delete(): void;
}

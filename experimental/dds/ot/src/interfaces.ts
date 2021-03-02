/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedObject, ISharedObjectEvents } from "@fluidframework/shared-object-base";
import { Serializable } from "@fluidframework/datastore-definitions";

export interface ISharedOTEvents<T extends Serializable> extends ISharedObjectEvents {
    (event: "valueChanged", listener: (value: T) => void);
    (event: "delete", listener: () => void);
}

export interface ISharedOT<T extends Serializable = any> extends ISharedObject<ISharedOTEvents<T>> {
    remove(path: (number | string)[], value: Serializable): void;
    move(fromPath: (number | string)[], toPath: (number | string)[]): void;
    insert(path: (number | string)[], value: Serializable): void;
    replace(path: (number | string)[], oldVal: Serializable, newVal: Serializable);
}

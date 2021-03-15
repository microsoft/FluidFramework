/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedObject } from "@fluidframework/shared-object-base";
import { Serializable } from "@fluidframework/datastore-definitions";

export interface ISharedOT extends ISharedObject {
    remove(path: (number | string)[], value: Serializable): void;
    move(fromPath: (number | string)[], toPath: (number | string)[]): void;
    insert(path: (number | string)[], value: Serializable): void;
    replace(path: (number | string)[], oldVal: Serializable, newVal: Serializable);
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISerializableValue } from "./interfaces";
import { ILocalValue } from "./localValues";

/**
 * Operation indicating a value should be set for a key.
 */
 export interface IMapSetOperation {
    /**
     * String identifier of the operation type.
     */
    type: "set";

    /**
     * Map key being modified.
     */
    key: string;

    /**
     * Value to be set on the key.
     */
    value: ISerializableValue;
}

/**
 * Operation indicating the map should be cleared.
 */
 export interface IMapClearOperation {
    /**
     * String identifier of the operation type.
     */
    type: "clear";
}

/**
 * Operation indicating a key should be deleted from the map.
 */
 export interface IMapDeleteOperation {
    /**
     * String identifier of the operation type.
     */
    type: "delete";

    /**
     * Map key being modified.
     */
    key: string;
}

export interface IMapKeyEditLocalOpMetadata {
    type: "edit";
    pendingMessageId: number;
    previousValue: ILocalValue;
}

export interface IMapKeyAddLocalOpMetadata {
    type: "add";
    pendingMessageId: number;
}

export interface IMapClearLocalOpMetadata {
    type: "clear";
    pendingMessageId: number;
    previousMap?: Map<string, ILocalValue>;
}

export type MapKeyLocalOpMetadata = IMapKeyEditLocalOpMetadata | IMapKeyAddLocalOpMetadata;
export type MapLocalOpMetadata = IMapClearLocalOpMetadata | MapKeyLocalOpMetadata;

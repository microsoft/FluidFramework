/*!
* Copyright (c) Microsoft Corporation and contributors. All rights reserved.
* Licensed under the MIT License.
*/

/* eslint-disable import/no-internal-modules */

export * from "./constants";
export * from "./consoleUtils";
export * from "./chronometer";
export * from "./joinPaths";
export * from "./guidUtils";
export * from "./error_objects";
export * from "./deferredPromise";
export * from "./deterministicRandomGenerator";
export * from "./hashCalculator";

import { Collection } from "./datastructures/collection";
import { SortedCollection } from "./datastructures/sortedCollection";
import { Integer64, Int64, Uint64 } from "./datastructures/integer64";

import {
    BaseDataArray,
    Float32DataArray,
    Float64DataArray,
    Int8DataArray,
    Int16DataArray,
    Int32DataArray,
    Uint8DataArray,
    Uint16DataArray,
    Uint32DataArray,
    UniversalDataArray,
    StringDataArray,
    BoolDataArray,
} from "./datastructures/dataArray";

export const Datastructures = {
    Collection,
    SortedCollection,
    Integer64,
    Int64,
    Uint64,
    DataArrays: {
        BaseDataArray,
        Float32DataArray,
        Float64DataArray,
        Int8DataArray,
        Int16DataArray,
        Int32DataArray,
        Uint8DataArray,
        Uint16DataArray,
        Uint32DataArray,
        UniversalDataArray,
        StringDataArray,
        BoolDataArray,
    },
};

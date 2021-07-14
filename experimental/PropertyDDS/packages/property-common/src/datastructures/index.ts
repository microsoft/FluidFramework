/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Collection } from "./collection";
import { SortedCollection } from "./sortedCollection";
import { Integer64, Int64, Uint64 } from "./integer64";
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
} from "./dataArray";

const DataArrays = {
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
};

export {
    Collection,
    SortedCollection,
    Integer64,
    Int64,
    Uint64,
    DataArrays,
};

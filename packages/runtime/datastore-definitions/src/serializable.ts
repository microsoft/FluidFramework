/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/component-core-interfaces";
import { AsJsonable, Jsonable, JsonablePrimitive } from "./jsonable";

/**
 * A union of the types that Fluid can intrinsically serialize, which is any type is that is
 * Json serializable + Json serializable objects/arrays with IFluidHandles at the leaves.
 *
 * Convenient when declaring type constraints, such as `<T extends Serializable>`.
 *
 * (See Jsonable for caveats regarding serialization of `undefined` and non-finite numbers.)
 */
export type Serializable = Jsonable<JsonablePrimitive | IFluidHandle>;

export type AsSerializable<T> = AsJsonable<T, JsonablePrimitive | IFluidHandle>;

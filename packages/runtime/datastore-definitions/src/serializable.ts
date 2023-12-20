/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import { Jsonable } from "./jsonable";

/**
 * Used to constrain a type 'T' to types that Fluid can intrinsically serialize.  Produces a
 * compile-time error if `T` contains non-serializable members.
 *
 * @remarks
 * See Jsonable for caveats regarding serialization of `undefined`, non-finite numbers,
 * and circular references.
 *
 * Important: `T extends Serializable<T>` is generally incorrect.
 * (Any value of `T` extends the serializable subset of itself.)
 *
 * @example Typical usage
 *
 * ```typescript
 * function serialize<T>(value: Serializable<T>) { ... }
 * ```
 * @alpha
 */
export type Serializable<T> = Jsonable<T, IFluidHandle>;

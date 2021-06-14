/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import { Jsonable } from "./jsonable";

/**
 * Used to constrain a type 'T' to types that Fluid can intrinsically serialize.  Produces an
 * error if `T` contains non-Jsonable members.
 *
 * Typical usage:
 * ```ts
 *      function serialize<T>(value: Serializable<T>) { ... }
 * ```
 *
 * Important: `T extends Serializable<T>` is a *superset* of `Serializable<T>` and almost always incorrect.
 *
 * (See Jsonable for caveats regarding serialization of `undefined` and non-finite numbers.)
 */
export type Serializable<T = any> = Jsonable<T, IFluidHandle>;

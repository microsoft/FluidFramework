/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * The `map` package provides interfaces and implementing classes for map-like distributed data structures.
 *
 * @remarks The following distributed data structures are defined in this package:
 *
 * - {@link SharedMap}
 *
 * - {@link SharedDirectory}
 *
 * @packageDocumentation
 */

export * from "./interfaces";
export * from "./map";
export * from "./directory";
export { LocalValueMaker, ILocalValue } from "./localValues";

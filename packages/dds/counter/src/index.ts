/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This library contains the {@link ISharedCounter | SharedCounter} distributed data structure.
 * A `SharedCounter` is a shared object which holds a whole number that can be incremented or decremented.
 *
 * @packageDocumentation
 */

export { SharedCounter } from "./counter.js";
export type { ISharedCounter, ISharedCounterEvents } from "./interfaces.js";

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * The `SharedCell` Distributed Data Structure (DDS) stores a single, shared value that can be edited or deleted.
 *
 * @packageDocumentation
 */

export { CellFactory, SharedCell } from "./cellFactory.js";
export type {
	ISharedCell,
	ISharedCellEvents,
	ICellOptions,
	ICellAttributionOptions,
} from "./interfaces.js";

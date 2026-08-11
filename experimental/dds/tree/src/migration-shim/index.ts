/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This library contains the {@link MigrationShim} distributed data structure.
 * A `MigrationShim` is a shared object which allows a client to migrate from one data structure to another on the fly.
 *
 * @packageDocumentation
 */

export type { IMigrationEvent } from './migrationShim.js';
export { MigrationShim } from './migrationShim.js';
export { MigrationShimFactory } from './migrationShimFactory.js';
export { SharedTreeShim } from './sharedTreeShim.js';
export { SharedTreeShimFactory } from './sharedTreeShimFactory.js';
export type { IShim } from './types.js';

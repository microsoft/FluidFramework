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

export type { IMigrationEvent } from "./migrationShim";
export { MigrationShim } from "./migrationShim";

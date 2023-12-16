/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * The sequence number which can be seen by all ops.
 *
 * This is useful in the context of snapshot loading, rollback, among other
 * scenarios.
 *
 * @internal
 */
export const UniversalSequenceNumber = 0;

/**
 * The sequence number of an op before it is acked.
 *
 * @internal
 */
export const UnassignedSequenceNumber = -1;

/**
 * @internal
 */
export const TreeMaintenanceSequenceNumber = -2;

/**
 * @internal
 */
export const LocalClientId = -1;

/**
 * @internal
 */
export const NonCollabClient = -2;

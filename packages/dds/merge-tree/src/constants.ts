/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * The sequence number at which all ops can be seen.
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
export const TreeMaintenanceSequenceNumber = -2;
export const LocalClientId = -1;
export const NonCollabClient = -2;

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Sequence numbers for shared segments start at 1 or greater.  Every segment marked
 * with sequence number zero will be counted as part of the requested string.
 */

export const UniversalSequenceNumber = 0;
export const UnassignedSequenceNumber = -1;
export const TreeMaintenanceSequenceNumber = -2;
export const LocalClientId = -1;
export const NonCollabClient = -2;

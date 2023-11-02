/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Sequence numbers for shared segments start at 1 or greater.  Every segment marked
 * with sequence number zero will be counted as part of the requested string.
 *
 * @deprecated This functionality was not meant to be exported and will be removed in a future release
 */
export const UniversalSequenceNumber = 0;

/**
 * @deprecated This functionality was not meant to be exported and will be removed in a future release
 */
export const UnassignedSequenceNumber = -1;

/**
 * @deprecated This functionality was not meant to be exported and will be removed in a future release
 */
export const TreeMaintenanceSequenceNumber = -2;

/**
 * @deprecated This functionality was not meant to be exported and will be removed in a future release
 */
export const LocalClientId = -1;

/**
 * @deprecated This functionality was not meant to be exported and will be removed in a future release
 */
export const NonCollabClient = -2;

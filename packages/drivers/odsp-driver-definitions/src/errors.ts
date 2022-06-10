/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DriverError, IDriverErrorBase } from "@fluidframework/driver-definitions";

export enum OdspErrorType {
    /**
     * Storage is out of space
     */
    outOfStorageError = "outOfStorageError",

    /**
     * Invalid file name (at creation of the file)
     */
    invalidFileNameError = "invalidFileNameError",

    /**
     * Snapshot is too big. Host application specified limit for snapshot size, and snapshot was bigger
     * that that limit, thus request failed. Hosting application is expected to have fall-back behavior for
     * such case.
     */
    snapshotTooBig = "snapshotTooBig",

    /*
     * Maximum time limit to fetch reached. Host application specified limit for fetching of snapshot, when
     * that limit is reached, request fails. Hosting application is expected to have fall-back behavior for
     * such case.
     */
    fetchTimeout = "fetchTimeout",

    /*
        * SPO admin toggle: fluid service is not enabled.
        */
    fluidNotEnabled = "fluidNotEnabled",

    fetchTokenError = "fetchTokenError",

    // This error will be raised when client is too behind with no way to catch up.
    // This condition will happen when user was offline for too long, resulting in old ops / blobs being deleted
    // by storage, and thus removing an ability for client to catch up.
    // This condition will result in any local changes being lost (i.e. only way to save state is by user
    // copying it over manually)
    cannotCatchUp = "cannotCatchUp",

    // SPO can occasionally return 403 for r/w operations on document when there is a fail over to another data center.
    // So to preserve integrity of the data, the data becomes readonly.
    serviceReadOnly = "serviceReadOnly",
}

export interface IOdspErrorAugmentations {
    /**
     * Server epoch indicates when the file was last modified.
     * Used to detect modifications outside Fluid's services
     */
    serverEpoch?: string;

    /**
     * It is the redirection url at which the network call should have been made. It is due to change
     * in site domain of the file on server.
     */
    redirectLocation?: string;

    /**
     * It is array of error codes included in error response from server.
     */
    facetCodes?: string[];
}

/**
 * Base interface for all errors and warnings
 * Superset of IDriverErrorBase, but with Odsp-specific errorType and properties
 */
export interface IOdspError extends Omit<IDriverErrorBase, "errorType">, IOdspErrorAugmentations {
    readonly errorType: OdspErrorType;
}

export type OdspError = IOdspError | (DriverError & IOdspErrorAugmentations);

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

    // The location of file can move on Spo. So if the file location moves and we try to access the older location, then
    // this error is thrown by server to let the client know about the new redirect location.
    locationRedirection = "locationRedirection",
}

/**
 * Base interface for all errors and warnings
 * Superset of IDriverErrorBase, but with Odsp-specific errorType
 */
export interface IOdspError extends Omit<IDriverErrorBase, "errorType"> {
    readonly errorType: OdspErrorType;
    /**
     * Server epoch indicates when the file was last modified.
     * Used to detect modifications outside Fluid's services
     */
    serverEpoch?: string;
}

export type OdspError =
    | DriverError
    | IOdspError;

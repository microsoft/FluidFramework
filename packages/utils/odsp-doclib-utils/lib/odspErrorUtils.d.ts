/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { DriverError } from "@fluidframework/driver-definitions";
export declare const offlineFetchFailureStatusCode: number;
export declare const fetchFailureStatusCode: number;
export declare const invalidFileNameStatusCode: number;
export declare const fetchIncorrectResponse = 712;
export declare enum OdspErrorType {
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
    fluidNotEnabled = "fluidNotEnabled"
}
/**
 * Base interface for all errors and warnings
 */
export interface IOdspError {
    readonly errorType: OdspErrorType;
    readonly message: string;
    canRetry: boolean;
    online?: string;
}
export declare type OdspError = DriverError | IOdspError;
export declare function createOdspNetworkError(errorMessage: string, statusCode?: number, retryAfterSeconds?: number, claims?: string): OdspError;
/**
 * Throws network error - an object with a bunch of network related properties
 */
export declare function throwOdspNetworkError(errorMessage: string, statusCode: number, response?: Response): void;
//# sourceMappingURL=odspErrorUtils.d.ts.map
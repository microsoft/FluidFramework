/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentStorageServicePolicies } from "../../storage";

/**
 * WARNING WARNING WARNING WARNING WARNING WARNING WARNING WARNING WARNING WARNING WARNING WARNING WARNING WARNING
 *
 * If you find this code doesn't compile, PLEASE STOP AND READ THIS!
 *
 * The maximumCacheDurationMs policy represents an important interop mechanism between the driver layer
 * and the runtime layer.  The driver layer owns using the snapshot cache. Meanwhile the runtime layer
 * runs Garbage Collection, which requires that the max age of snapshots is constrained in order to reliably
 * compute when an object cannot possibly be referenced anymore and should be deleted.
 * To protect against data loss, the runtime will close the container if it finds the value of
 * maximumCacheDurationMs has changed (specifically, grown) in the lifetime of a file.
 *
 * So changing the type restrictions on this policy will likely lead to locking users out of existing documents.
 *
 * WARNING WARNING WARNING WARNING WARNING WARNING WARNING WARNING WARNING WARNING WARNING WARNING WARNING WARNING
 */

declare function assertNever(x: never): void;
declare const maximumCacheDurationMs: IDocumentStorageServicePolicies["maximumCacheDurationMs"];
switch (maximumCacheDurationMs) {
    // These are the only two valid values
    case undefined:
    case 432000000:
        break;
    default:
        assertNever(maximumCacheDurationMs);
}

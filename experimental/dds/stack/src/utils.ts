/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedObject } from "@fluidframework/shared-object-base";

/**
 * Given the relative path to a summary element that is scoped to a `SharedObject`, return the
 * fully qualified path for that element
 */
export function getSummaryHandlePath(sharedObject: SharedObject, relativePath: string): string {
    const [prefix] = sharedObject.handle.absolutePath.split(sharedObject.id);
    return `.channels${prefix}.channels/${sharedObject.id}/${relativePath}`;
}

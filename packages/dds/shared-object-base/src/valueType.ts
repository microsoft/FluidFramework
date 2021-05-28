/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * enum representing the possible types of a shared object
 */
export enum ValueType {
    /**
     * The value is a shared object
     * @deprecated Instead store the handle of the shared object, rather than the shared object itself.
     */
    Shared,

    /**
     * The value is a plain JavaScript object or handle.  If a plain object, it may contain handles deeper within.
     */
    Plain,
}

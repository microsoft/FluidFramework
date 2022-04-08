/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Iterator types
 * The operations that can be performed on the array
 */
export enum ArrayIteratorOperationTypes {
    INSERT,
    REMOVE,
    MODIFY,
    // MOVE, // reserved, not implemented yet
    NOP,
}

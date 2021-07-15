/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Base user definition. It is valid to extend this interface when adding new details to the user object.
 */
export interface IUser {
    id: string;
    name?: string;
}

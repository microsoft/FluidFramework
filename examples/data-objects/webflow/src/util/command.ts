/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export interface ICommand {
    name: string;
    enabled: () => boolean;
    exec: () => void;
}

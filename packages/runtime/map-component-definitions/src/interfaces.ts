/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Type of "valueChanged" event parameter.
 */
export interface IValueChanged {
    /**
     * The key storing the value that changed.
     */
    key: string;

    /**
     * The value that was stored at the key prior to the change.
     */
    previousValue: any;

    /**
     * Optional prefix for key used to group changes
     */
    keyPrefix?: string;
}

/**
 * Type of "valueChanged" event parameter for SharedDirectory
 */
export interface IDirectoryValueChanged extends IValueChanged {
    /**
     * The absolute path to the IDirectory storing the key which changed.
     */
    path: string;
}

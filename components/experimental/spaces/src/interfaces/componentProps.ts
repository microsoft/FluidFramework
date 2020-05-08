/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Templates } from "..";

/**
 * IComponentSpacesToolbarProps are all callbacks that a toolbar using Spaces might want to have.
 */
export interface IComponentSpacesToolbarProps {
    addComponent?(type: string): void;
    templatesAvailable?(): boolean;
    applyTemplate?(template: Templates): void;
}

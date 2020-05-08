/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Templates } from "..";

/**
 * ISpacesProps are the public interface that SpacesView will use to communicate with Spaces.
 */
export interface ISpacesProps {
    addComponent?(type: string): void;
    templatesAvailable?: boolean;
    applyTemplate?(template: Templates): void;
}

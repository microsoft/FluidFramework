/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISpacesCollectible } from "../spacesStorage";
import { Templates } from "..";

/**
 * IComponentSpacesToolbarProps are all callbacks that a toolbar using Spaces might want to have.
 */
export interface IComponentSpacesToolbarProps {
    addComponent?(type: string): void;
    addItem?(item: ISpacesCollectible): string;
    templatesAvailable?(): boolean;
    addTemplate?(template: Templates): void;
    saveLayout?(): void;
    editable?(): boolean;
    setEditable?(isEditable?: boolean): void;
}

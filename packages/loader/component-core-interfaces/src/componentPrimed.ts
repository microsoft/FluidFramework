/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDirectoryValueChanged } from "@microsoft/fluid-map-component-definitions";

export const IComponentPrimed: keyof IProvideComponentPrimed = "IComponentPrimed";

export interface IProvideComponentPrimed {
    readonly IComponentPrimed: IComponentPrimed;
}

/**
 * Provides functionality to retrieve subsets of an internal registry based on membership in a template.
 */
export interface IComponentPrimed extends IProvideComponentPrimed {
    addListenerToRootValueChanged: (
        listener: (
            changed: IDirectoryValueChanged,
            local: boolean,
        ) => void,
    ) => void,
}

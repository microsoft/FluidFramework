/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDirectoryValueChanged } from "@microsoft/fluid-map";

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideComponentListened>> { }
}

export const IComponentListened: keyof IProvideComponentListened = "IComponentListened";

export interface IProvideComponentListened {
    readonly IComponentListened: IComponentListened;
}

/**
 * Provides functionality to retrieve subsets of an internal registry based on membership in a template.
 */
export interface IComponentListened extends IProvideComponentListened {
    addListenerToRootValueChanged: (
        listener: (
            changed: IDirectoryValueChanged,
            local: boolean,
        ) => void,
    ) => void,
}

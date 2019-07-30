/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    IComponent,
} from "@prague/container-definitions";

declare module "@prague/container-definitions" {
    export interface IComponent {
        readonly IComponentForge?: IComponentForge;
    }
}

/**
 * Implementing this interface identifies that as part of component creation you want to perform an action after
 * creation but before attaching.
 */
export interface IComponentForge extends IComponent {

    readonly IComponentForge: IComponentForge;

    /**
     * Modify your existing setup after creation and before attach.
     * @param props - initial setup properties
     */
    forge(props?: any): Promise<void>;
}

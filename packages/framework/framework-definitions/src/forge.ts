/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { } from "@prague/component-core-interfaces";

declare module "@prague/component-core-interfaces" {
    export interface IComponent {
        readonly IComponentForge?: IComponentForge;
    }
}

/**
 * Implementing this interface identifies that as part of component creation you want to perform an action after
 * creation but before attaching.
 */
export interface IComponentForge {
    /**
     * Modify your existing setup after creation and before attach.
     * @param props - initial setup properties
     */
    forge(props?: any): Promise<void>;
}

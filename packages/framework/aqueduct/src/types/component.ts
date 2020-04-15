/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { IComponentRuntime, IComponentContext } from "@microsoft/fluid-runtime-definitions";
import { AsyncComponentProvider, ComponentKey } from "@microsoft/fluid-synthesize";

import { SharedComponent } from "../components";

/**
 * Define a default constructor for an Aqueduct Component
 */
export type ComponentCtor<O extends IComponent,R extends IComponent,T extends SharedComponent<O,R>> =
    new (
        runtime: IComponentRuntime,
        context: IComponentContext,
        providers: AsyncComponentProvider<ComponentKey<O>,ComponentKey<R>>,
    ) => T;

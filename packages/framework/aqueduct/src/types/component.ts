/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@microsoft/fluid-component-core-interfaces";

import {
    ISharedComponentProps,
    SharedComponent,
} from "../components";

/**
 * Define a default constructor for an Aqueduct Component
 */
export type ComponentCtor<O extends IComponent,T extends SharedComponent<O>> =
    new (props: ISharedComponentProps) => T;

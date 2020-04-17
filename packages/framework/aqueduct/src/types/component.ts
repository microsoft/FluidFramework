/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { IEvent } from "@microsoft/fluid-common-definitions";

import {
    ISharedComponentProps,
    SharedComponent,
} from "../components";

/**
 * Define a default constructor for an Aqueduct Component
 */
export type ComponentCtor<O extends IComponent, E extends IEvent, T extends SharedComponent<O, E>> =
    new (props: ISharedComponentProps<O>) => T;

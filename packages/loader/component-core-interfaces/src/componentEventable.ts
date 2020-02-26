/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";

export interface IProvideComponentEventable {
    readonly IComponentEventable: IComponentEventable;
}

/**
 * An IComponentEventable is a component that can emit and listen to events.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IComponentEventable extends EventEmitter { }


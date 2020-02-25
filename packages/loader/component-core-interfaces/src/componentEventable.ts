/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";

export interface IProvideComponentEventable {
    readonly IComponentEventable: IComponentEventable;
}

/**
 * An IComponentHTMLView is a renderable component, which may or may not also be its own model.
 * If it is its own model, it is a "thick" view, otherwise it is a "thin" view.
 */
export interface IComponentEventable extends EventEmitter {
    sendModifyEvent<T>(eventName: string, args: T)
}


/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IValueType } from "./interfaces";

// register default types
// TODO given the global nature of this - and that we want to have each component be responsible for what they
// register we should deprecate this and instead make it a parameter to the extension on creation
export const defaultValueTypes = new Array<IValueType<any>>();
export function registerDefaultValueType(type: IValueType<any>) {
    defaultValueTypes.push(type);
}

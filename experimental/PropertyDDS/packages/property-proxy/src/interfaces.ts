/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseProperty } from "@fluid-experimental/property-properties";

export interface IProxy<T = BaseProperty> {
    getProperty(): T
}

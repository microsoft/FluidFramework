/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
* Views may be written using a variety of UI frameworks. The view adapters
* module provides helpful tools for composing these views, intended for use when
* either:
*
* 1. The view being composed is from a different framework than its visual host.
*
* 2. It is not known which framework was used in the view being composed.
*
* The adapters translate between different view frameworks to satisfy #1, and are
* able to inspect a view to deduce its framework to satisfy #2.
*
* @packageDocumentation
*/

export { HTMLViewAdapter } from "./htmlview";
export { MountableView } from "./mountableview";
export { IReactViewAdapterProps, ReactViewAdapter } from "./react";

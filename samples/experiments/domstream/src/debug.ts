/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as registerDebug from "debug";

export const debug = registerDebug("domstream:status");
export const debugDOM = registerDebug("domstream:dom");
export const debugPort = registerDebug("domstream:port");
export const debugPopup = registerDebug("domstream:popup");

const internalDebugFrame = registerDebug("domstream:frame");
export const debugFrame = (frameId, ...args) => { internalDebugFrame("Frame", frameId, ":", ...args); };

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// TODOs:
// - Better documentation terminology WRT "inbound" vs "outbound" events.
//   - Since the types and utilities are re-used between the packages, these should be documented in
//     explicit terms of the debugger to/from external consumer.

/**
 * This directory contains types and utilities for use in window-based messaging, used
 * by the Fluid Client Debugger.
 */

// TODO: re-enable this once the API surface has settled
/* eslint-disable no-restricted-syntax */

export * from "./Constants";
export * from "./DebuggerMessages";
export * from "./Messages";
export * from "./RegistryMessages";
export * from "./Utilities";

/* eslint-enable no-restricted-syntax */

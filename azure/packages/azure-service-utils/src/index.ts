/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A set of helper utilities for building backend APIs for use with
 * {@link https://docs.microsoft.com/en-us/azure/azure-fluid-relay/overview/overview | Azure Fluid Relay}.
 *
 * @remarks
 * Note that this library's primary entry-point ({@link generateToken}) is only intended
 * to be run in a browser context.
 * It is **not** Node.js-compatible.
 *
 * @packageDocumentation
 */

export type { IUser } from "@fluidframework/driver-definitions";
export { ScopeType } from "@fluidframework/driver-definitions/internal";
export { generateToken } from "./generateToken.js";

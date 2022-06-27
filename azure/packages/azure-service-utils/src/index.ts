/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A set of helper utilities for building backend APIs for use with
 * {@link https://docs.microsoft.com/en-us/azure/azure-fluid-relay/overview/overview | Azure Fluid Relay}.
 *
 * Note that this package's primary entry-point ({@link generateToken}) is only intended to be run in a browser context.
 * It is **not** Node.js-compatible.
 *
 * @packageDocumentation
 */

export { IUser, ScopeType } from "@fluidframework/protocol-definitions";
export { generateToken } from "./generateToken";

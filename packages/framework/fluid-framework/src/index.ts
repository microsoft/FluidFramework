/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * The `fluid-framework` package is the primary entry-point into the Fluid client ecosystem when paired with
 * a corresponding service client package (for example, `@fluidframework/azure-client` or
 * `@fluidframework/tinylicious-client`).
 *
 * It contains necessary types and functionality for creating and loading
 * {@link https://fluidframework.com/docs/build/containers/ | Containers}.
 *
 * It also includes a few {@link https://fluidframework.com/docs/build/dds/ | Distributed Data Structures (DDSes)}
 * to get you started using Fluid. These include:
 *
 * - {@link @fluidframework/map#SharedMap}
 *
 * - {@link @fluidframework/map#SharedDirectory}
 *
 * - {@link @fluidframework/sequence#SharedString}
 *
 * Other DDSes and related libraries are published separately.
 *
 * @packageDocumentation
 */

 export { AttachState } from "@fluidframework/container-definitions";
export { ConnectionState } from "@fluidframework/container-loader";
export * from "@fluidframework/fluid-static";
export * from "@fluidframework/map";
export * from "@fluidframework/sequence";

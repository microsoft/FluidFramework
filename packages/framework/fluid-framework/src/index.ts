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
 * @remarks This package is implemented by re-exporting contents from the following library packages:
 *
 * - `@fluidframwork/container-definitions`
 *
 * - `@fluidframwork/container-loader`
 *
 * - `@fluidframwork/fluid-static`
 *
 * - `@fluidframwork/map`
 *
 * - `@fluidframwork/sequence`
 *
 * @packageDocumentation
 */

export * from "./containerDefinitions";
export * from "./containerLoader";
export * from "./fluidStatic";
export * from "./map";
export * from "./sequence";

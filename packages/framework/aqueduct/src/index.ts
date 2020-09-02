/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * The `aqueduct` package is a library for building Fluid objects and Fluid
 * containers within the Fluid Framework. Its goal is to provide a thin base
 * layer over the existing Fluid Framework interfaces that allows developers to
 * get started quickly.
 *
 * @remarks
 * About the package name: An Aqueduct is a way to transport water from a source
 * to another location. The package name was chosen because its purpose is to
 * facilitate using lower level constructs and therefore handle 'fluid' items
 * same as an aqueduct.
 *
 * @packageDocumentation
 */

export * from "./data-object-factories";
export * from "./data-objects";
export * from "./container-runtime-factories";
export * from "./container-services";
export * from "./request-handlers";
export * from "./utils";

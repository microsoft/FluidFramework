/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * The `aqueduct` package is a library for building Fluid objects and Fluid
 * containers within the Fluid Framework. Its goal is to provide a thin base
 * layer over the existing Fluid Framework interfaces that allows developers to
 * get started quickly.
 *
 * @remarks
 * About the library name: An "aqueduct" is a way to transport water from a source
 * to another location. The library name was chosen because its purpose is to
 * facilitate using lower level constructs and therefore handle 'fluid' items
 * same as an aqueduct.
 *
 * @packageDocumentation
 */

export { DataObjectFactory, PureDataObjectFactory } from "./data-object-factories/index.js";
export {
	DataObject,
	type DataObjectTypes,
	type IDataObjectProps,
	PureDataObject,
	createDataObjectKind,
} from "./data-objects/index.js";
export {
	BaseContainerRuntimeFactory,
	type BaseContainerRuntimeFactoryProps,
	ContainerRuntimeFactoryWithDefaultDataStore,
	type ContainerRuntimeFactoryWithDefaultDataStoreProps,
} from "./container-runtime-factories/index.js";

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IRuntimeFactory } from "@fluidframework/container-definitions/internal";
import type {
	IContainerRuntimeOptions,
	MinimumVersionForCollab,
} from "@fluidframework/container-runtime/internal";
import { FluidDataStoreRegistry } from "@fluidframework/container-runtime/internal";
import type { IFluidDataStoreRegistry } from "@fluidframework/runtime-definitions/internal";

import { DOProviderContainerRuntimeFactory, RootDataObjectFactory } from "./rootDataObject.js";
import {
	TreeDOProviderContainerRuntimeFactory,
	TreeRootDataObjectFactory,
	validateAndExtractTreeKey,
} from "./treeRootDataObject.js";
import type { CompatibilityMode, ContainerSchema } from "./types.js";
import { parseDataObjectsFromSharedObjects } from "./utils.js";

/**
 * Creates an {@link @fluidframework/aqueduct#BaseContainerRuntimeFactory} which constructs containers
 * with an entry point containing single IRootDataObject (entry point is opaque to caller),
 * where the root data object's registry and initial objects are configured based on the provided
 * schema (and optionally, data store registry).
 *
 * @legacy @alpha
 */
export function createDOProviderContainerRuntimeFactory(props: {
	/**
	 * The schema for the container.
	 */
	schema: ContainerSchema;
	/**
	 * See {@link CompatibilityMode} and compatibilityModeRuntimeOptions for more details.
	 */
	compatibilityMode: CompatibilityMode;
	/**
	 * Optional registry of data stores to pass to the DataObject factory.
	 * If not provided, one will be created based on the schema.
	 */
	rootDataStoreRegistry?: IFluidDataStoreRegistry;
	/**
	 * Optional overrides for the container runtime options.
	 * If not provided, only the default options for the given compatibilityMode will be used.
	 */
	runtimeOptionOverrides?: Partial<IContainerRuntimeOptions>;
	/**
	 * Optional override for minimum version for collab.
	 * If not provided, the default for the given compatibilityMode will be used.
	 * @remarks
	 * This is useful when runtime options are overridden and change the minimum version for collab.
	 */
	minVersionForCollabOverride?: MinimumVersionForCollab;
	/**
	 * Optional flag to indicate whether to use tree-based data objects.
	 * @remarks
	 * If not provided, we default to false, i.e. to use a directory-based data object.
	 *
	 * If provided, then `schema`'s `initialObjects` must contain a single entry that is a `SharedTree`.
	 * If this condition is not met, an error will be thrown.
	 *
	 * @privateRemarks
	 * Note that this flag is a temporary solution to make it possible to instantiate a Fluid Container with a tree-based data object.
	 * This will likely be removed in the near future once a better API entrypoint for this functionality has been created.
	 */
	useTreeBasedDataObject?: boolean;
}): IRuntimeFactory {
	const [registryEntries, sharedObjects] = parseDataObjectsFromSharedObjects(props.schema);
	const registry = props.rootDataStoreRegistry ?? new FluidDataStoreRegistry(registryEntries);

	if (props.useTreeBasedDataObject) {
		const treeKey = validateAndExtractTreeKey(props.schema);
		return new TreeDOProviderContainerRuntimeFactory(
			props.compatibilityMode,
			new TreeRootDataObjectFactory(treeKey, sharedObjects, registry),
			{
				runtimeOptions: props.runtimeOptionOverrides,
				minVersionForCollab: props.minVersionForCollabOverride,
			},
		);
	} else {
		return new DOProviderContainerRuntimeFactory(
			props.schema,
			props.compatibilityMode,
			new RootDataObjectFactory(sharedObjects, registry),
			{
				runtimeOptions: props.runtimeOptionOverrides,
				minVersionForCollab: props.minVersionForCollabOverride,
			},
		);
	}
}

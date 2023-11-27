/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { RouterliciousEndpoint, TestDriverTypes } from "@fluidframework/test-driver-definitions";

/**
 * Different kind of compat version config
 *
 * @internal
 */
export const CompatKind: {
	None: "None";
	Loader: "Loader";
	NewLoader: "NewLoader";
	Driver: "Driver";
	NewDriver: "NewDriver";
	ContainerRuntime: "ContainerRuntime";
	NewContainerRuntime: "NewContainerRuntime";
	DataRuntime: "DataRuntime";
	NewDataRuntime: "NewDataRuntime";
	LoaderDriver: "LoaderDriver";
	/**
	 * CrossVersion tests are used to test compatibility when two differently versioned clients connect to the same container.
	 * This is done by varying the version that the `TestObjectProviderWithVersionedLoad` uses to create and load containers.
	 *
	 * Note: Each individual client will use the same version for all layers (loader/driver/runtime/etc). For example, if Client A
	 * is running version 1.0 and Client B is running version 2.0, then Client A will use version 1.0 for all layers and Client B
	 * will be use version 2.0 for all layers.
	 */
	CrossVersion: "CrossVersion";
};

/**
 * Different kind of compat version config
 *
 * @internal
 */
export type CompatKind = keyof typeof CompatKind;

/**
 * @internal
 */
export const compatKind: CompatKind[] | undefined;
/**
 * @internal
 */
export const compatVersions: string[] | undefined;
/**
 * @internal
 */
export const driver: TestDriverTypes;
/**
 * @internal
 */
export const r11sEndpointName: RouterliciousEndpoint;
/**
 * @internal
 */
export const reinstall: boolean;
/**
 * @internal
 */
export const tenantIndex: number;

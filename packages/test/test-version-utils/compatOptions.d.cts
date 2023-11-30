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

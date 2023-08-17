/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { RouterliciousEndpoint, TestDriverTypes } from "@fluidframework/test-driver-definitions";

/**
 * Different kind of compat version config
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
 */
export type CompatKind = keyof typeof CompatKind;

export const compatKind: CompatKind[] | undefined;
export const compatVersions: string[] | undefined;
export const driver: TestDriverTypes;
export const r11sEndpointName: RouterliciousEndpoint;
export const reinstall: boolean;
export const tenantIndex: number;

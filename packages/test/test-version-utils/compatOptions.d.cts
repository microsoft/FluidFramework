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
	/**
	 * CrossVersion tests are used to test compatibility between the current version and the most recent major public release.
	 * For example, at the time of writing, main is on version 2.0.0-internal.7.3.0, so we would test 2.0.0-internal.7.3.0
	 * against the latest public release (1.3.7) instead of the latest internal major release (2.0.0-internal.6.4.0).
	 */
	CrossVersion: "CrossVersion";
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

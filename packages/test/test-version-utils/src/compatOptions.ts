/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	OdspEndpoint,
	RouterliciousEndpoint,
	TestDriverTypes,
} from "@fluid-internal/test-driver-definitions";
import nconf from "nconf";

/**
 * Different kind of compat version config
 */
export const CompatKind = {
	None: "None",
	Loader: "Loader",
	NewLoader: "NewLoader",
	Driver: "Driver",
	NewDriver: "NewDriver",
	ContainerRuntime: "ContainerRuntime",
	NewContainerRuntime: "NewContainerRuntime",
	DataRuntime: "DataRuntime",
	NewDataRuntime: "NewDataRuntime",
	LoaderDriver: "LoaderDriver",
	/**
	 * CrossClient tests are used to test compatibility when two differently versioned clients connect to the same container.
	 * This is done by varying the version that the `TestObjectProviderWithVersionedLoad` uses to create and load containers.
	 *
	 * Note: Each individual client will use the same version for all layers (loader/driver/runtime/etc). For example, if Client A
	 * is running version 1.0 and Client B is running version 2.0, then Client A will use version 1.0 for all layers and Client B
	 * will be use version 2.0 for all layers.
	 */
	CrossClient: "CrossClient",
} as const;

/*
 * Parse the command line argument and environment variables. Arguments take precedent over environment variable
 * NOTE: Please update this packages README.md if the default versions and config combination changes
 */
const options = {
	compatKind: {
		description: "Compat kind to run",
		choices: [
			CompatKind.None,
			CompatKind.Loader,
			CompatKind.NewLoader,
			CompatKind.Driver,
			CompatKind.NewDriver,
			CompatKind.ContainerRuntime,
			CompatKind.NewContainerRuntime,
			CompatKind.DataRuntime,
			CompatKind.NewDataRuntime,
			CompatKind.LoaderDriver,
		],
		requiresArg: true,
		array: true,
	},
	compatVersion: {
		description: "Compat version to run",
		requiresArg: true,
		array: true,
		type: "string",
	},
	reinstall: {
		default: false,
		description: "Force compat package to be installed",
		boolean: true,
	},
	driver: {
		choices: ["tinylicious", "t9s", "routerlicious", "r11s", "odsp", "local"],
		requiresArg: true,
	},
	r11sEndpointName: {
		type: "string",
	},
	odspEndpointName: {
		type: "string",
	},
	tenantIndex: {
		type: "number",
	},
	baseVersion: {
		type: "string",
	},
};

nconf
	.argv({
		...options,
		transform: (obj: { key: string; value: string }) => {
			if (options[obj.key] !== undefined) {
				obj.key = `fluid:test:${obj.key}`;
			}
			return obj;
		},
	})
	.env({
		separator: "__",
		whitelist: [
			"fluid__test__compatKind",
			"fluid__test__compatVersion",
			"fluid__test__backCompat",
			"fluid__test__driver",
			"fluid__test__r11sEndpointName",
			"fluid__test__odspEndpointName",
			"fluid__test__baseVersion",
		],
		transform: (obj: { key: string; value: string }) => {
			if (!obj.key.startsWith("fluid__test__")) {
				return obj;
			}
			const key = obj.key.substring("fluid__test__".length);
			if (options[key]?.array) {
				try {
					obj.value = JSON.parse(obj.value);
				} catch {
					// ignore
				}
			}
			return obj;
		},
	})
	.defaults({
		fluid: {
			test: {
				driver: "local",
				r11sEndpointName: "r11s",
				tenantIndex: 0,
			},
		},
	});

/**
 * Different kind of compat version config
 */

/**
 * @internal
 */
export type CompatKind = keyof typeof CompatKind;

/**
 * @internal
 */
export const compatKind = nconf.get("fluid:test:compatKind") as CompatKind[] | undefined;
/**
 * @internal
 */
export const compatVersions = nconf.get("fluid:test:compatVersion") as string[] | undefined;
/**
 * @internal
 */
export const driver = nconf.get("fluid:test:driver") as TestDriverTypes;
/**
 * @internal
 */
export const odspEndpointName = nconf.get("fluid:test:odspEndpointName") as OdspEndpoint;
/**
 * @internal
 */
export const r11sEndpointName = nconf.get(
	"fluid:test:r11sEndpointName",
) as RouterliciousEndpoint;
/**
 * @internal
 */
export const reinstall = nconf.get("fluid:test:reinstall");
/**
 * @internal
 */
export const tenantIndex = nconf.get("fluid:test:tenantIndex") as number;

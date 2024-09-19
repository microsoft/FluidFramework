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
	 * CrossVersion tests are used to test compatibility when two differently versioned clients connect to the same container.
	 * This is done by varying the version that the `TestObjectProviderWithVersionedLoad` uses to create and load containers.
	 *
	 * Note: Each individual client will use the same version for all layers (loader/driver/runtime/etc). For example, if Client A
	 * is running version 1.0 and Client B is running version 2.0, then Client A will use version 1.0 for all layers and Client B
	 * will be use version 2.0 for all layers.
	 */
	CrossVersion: "CrossVersion",
} as const;

/*
 * Parse the command line argument and environment variables. Arguments take precedent over environment variable
 * NOTE: Please update this packages README.md if the default versions and config combination changes
 */
export const options = {
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
		type: "boolean",
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
			// If any of the FF specific options are defined, set them as environment variablse so they are available
			// to worker processes too.
			// Otherwise mocha's --parallel flag will not work correctly because console flags are not passed to the worker
			// processes, so they will run tests with default settings instead of the specified ones.
			if (options[obj.key] !== undefined) {
				// Important to JSON.stringify() arrays and objects so when we JSON.parse() them as we process values from env
				// variables they are set correctly.
				const shouldStringify = Array.isArray(obj.value) || typeof obj.value === "object";
				process.env[`fluid__test__${obj.key}`] = shouldStringify
					? JSON.stringify(obj.value)
					: obj.value;

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
			"fluid__test__reinstall", // TODO: doesn't work for parallel processes; but we don't use it?
			"fluid__test__tenantIndex",
			"fluid__test__r11sEndpointName",
			"fluid__test__odspEndpointName",
			"fluid__test__baseVersion",
		],
		// We know that environment variables always come as strings, but since we want the transform function
		// to be able to set obj.value to different types, we use unkwown here as an alternative to adding as-casts
		// wherever we set it to something that is not a string.
		// And since we know the value will always start as a string, we assign 'stringValue' to avoid having to cast
		// obj.value to string every time we use a string method on it.
		transform: (obj: { key: string; value: unknown }) => {
			const stringValue: string = obj.value as string;

			if (!obj.key.startsWith("fluid__test__")) {
				return obj;
			}

			const key = obj.key.substring("fluid__test__".length);

			// Environment flags are always strings, but in order to get values whose types match the types that the CLI
			// flags would have, we need to parse them.
			if (options[key]?.array) {
				if (!stringValue.startsWith("[")) {
					// A bit of proctection against potential bugs.
					throw new Error(
						`Environment variable '${obj.key}' must be a stringified JSON array. Got '${stringValue}'.`,
					);
				}
				obj.value = JSON.parse(stringValue);
			}

			if (options[key]?.type === "number") {
				obj.value = parseInt(stringValue, 10);
			}
			if (options[key]?.type === "boolean") {
				obj.value = Boolean(stringValue);
			}
			// console.log(`Setting ${key} to ${obj.value}`);
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

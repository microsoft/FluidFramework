/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type {
	IFluidDataStoreFactory,
	OldestSupportedClientVersion,
} from "@fluidframework/runtime-definitions/internal";

import {
	BaseContainerRuntimeFactory,
	type BaseContainerRuntimeFactoryProps,
	ContainerRuntimeFactoryWithDefaultDataStore,
	type ContainerRuntimeFactoryWithDefaultDataStoreProps,
	type DeprecatedBaseContainerRuntimeFactoryProps,
	type DeprecatedContainerRuntimeFactoryWithDefaultDataStoreProps,
} from "../container-runtime-factories/index.js";

const commonProps = {
	registryEntries: [],
	provideEntryPoint: async () => ({}),
};
const defaultFactory: IFluidDataStoreFactory = {
	type: "default",
	get IFluidDataStoreFactory() {
		return this;
	},
	instantiateDataStore: async () => {
		throw new Error("Not used by this test.");
	},
};

describe("BaseContainerRuntimeFactory compatibility parameter", () => {
	it("keeps the canonical construction properties extendable", () => {
		interface ExtendedProps extends BaseContainerRuntimeFactoryProps {
			readonly customProperty: boolean;
		}
		const props: ExtendedProps = {
			...commonProps,
			oldestSupportedClient: "2.0.0",
			customProperty: true,
		};

		assert.doesNotThrow(() => new BaseContainerRuntimeFactory(props));
	});

	it("preserves the deprecated construction overload", () => {
		const props: DeprecatedBaseContainerRuntimeFactoryProps = {
			...commonProps,
			minVersionForCollab: "2.0.0",
		};

		assert.doesNotThrow(() => new BaseContainerRuntimeFactory(props));
	});

	const createWithCompatibilityProperties = (properties: {
		readonly oldestSupportedClient?: OldestSupportedClientVersion;
		readonly minVersionForCollab?: OldestSupportedClientVersion;
	}): BaseContainerRuntimeFactory =>
		new BaseContainerRuntimeFactory({
			...commonProps,
			...properties,
		} as unknown as BaseContainerRuntimeFactoryProps);

	it("rejects a missing compatibility parameter", () => {
		assert.throws(() => createWithCompatibilityProperties({}), /Specify exactly one/);
	});

	it("rejects both compatibility parameters", () => {
		assert.throws(
			() =>
				createWithCompatibilityProperties({
					oldestSupportedClient: "2.0.0",
					minVersionForCollab: "2.0.0",
				}),
			/Specify exactly one/,
		);
	});
});

describe("ContainerRuntimeFactoryWithDefaultDataStore compatibility parameter", () => {
	it("preserves the deprecated construction overload", () => {
		const props: DeprecatedContainerRuntimeFactoryWithDefaultDataStoreProps = {
			...commonProps,
			defaultFactory,
			minVersionForCollab: "2.0.0",
		};

		assert.doesNotThrow(() => new ContainerRuntimeFactoryWithDefaultDataStore(props));
	});

	const createWithCompatibilityProperties = (properties: {
		readonly oldestSupportedClient?: OldestSupportedClientVersion;
		readonly minVersionForCollab?: OldestSupportedClientVersion;
	}): ContainerRuntimeFactoryWithDefaultDataStore =>
		new ContainerRuntimeFactoryWithDefaultDataStore({
			...commonProps,
			defaultFactory,
			...properties,
		} as unknown as ContainerRuntimeFactoryWithDefaultDataStoreProps);

	it("rejects a missing compatibility parameter", () => {
		assert.throws(() => createWithCompatibilityProperties({}), /Specify exactly one/);
	});

	it("rejects both compatibility parameters", () => {
		assert.throws(
			() =>
				createWithCompatibilityProperties({
					oldestSupportedClient: "2.0.0",
					minVersionForCollab: "2.0.0",
				}),
			/Specify exactly one/,
		);
	});
});

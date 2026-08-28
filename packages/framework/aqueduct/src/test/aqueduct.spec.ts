/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions/internal";
import { defaultMinVersionForCollab as defaultTestOldestSupportedClient } from "@fluidframework/runtime-utils/internal";

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

const createBaseContainerRuntimeFactory = (
	props: BaseContainerRuntimeFactoryProps | DeprecatedBaseContainerRuntimeFactoryProps,
): BaseContainerRuntimeFactory => new BaseContainerRuntimeFactory(props);

const createContainerRuntimeFactoryWithDefaultDataStore = (
	props:
		| ContainerRuntimeFactoryWithDefaultDataStoreProps
		| DeprecatedContainerRuntimeFactoryWithDefaultDataStoreProps,
): ContainerRuntimeFactoryWithDefaultDataStore =>
	new ContainerRuntimeFactoryWithDefaultDataStore(props);

describe("BaseContainerRuntimeFactory compatibility parameter", () => {
	it("keeps the canonical construction properties extendable", () => {
		interface ExtendedProps extends BaseContainerRuntimeFactoryProps {
			readonly customProperty: boolean;
		}
		const props: ExtendedProps = {
			...commonProps,
			oldestSupportedClient: defaultTestOldestSupportedClient,
			customProperty: true,
		};

		assert.doesNotThrow(() => createBaseContainerRuntimeFactory(props));
	});

	it("preserves the deprecated construction overload", () => {
		const props: DeprecatedBaseContainerRuntimeFactoryProps = {
			...commonProps,
			minVersionForCollab: defaultTestOldestSupportedClient,
		};

		assert.doesNotThrow(() => createBaseContainerRuntimeFactory(props));
	});

	it("rejects a missing compatibility parameter", () => {
		assert.throws(() => {
			// @ts-expect-error A compatibility property is required.
			new BaseContainerRuntimeFactory(commonProps);
		}, /Specify exactly one/);
	});

	it("rejects both compatibility parameters", () => {
		assert.throws(() => {
			// @ts-expect-error Exactly one compatibility property may be supplied.
			new BaseContainerRuntimeFactory({
				...commonProps,
				oldestSupportedClient: defaultTestOldestSupportedClient,
				minVersionForCollab: defaultTestOldestSupportedClient,
			});
		}, /Specify exactly one/);
	});
});

describe("ContainerRuntimeFactoryWithDefaultDataStore compatibility parameter", () => {
	it("preserves the canonical construction overload", () => {
		const props: ContainerRuntimeFactoryWithDefaultDataStoreProps = {
			...commonProps,
			defaultFactory,
			oldestSupportedClient: defaultTestOldestSupportedClient,
		};

		assert.doesNotThrow(() => createContainerRuntimeFactoryWithDefaultDataStore(props));
	});

	it("preserves the deprecated construction overload", () => {
		const props: DeprecatedContainerRuntimeFactoryWithDefaultDataStoreProps = {
			...commonProps,
			defaultFactory,
			minVersionForCollab: defaultTestOldestSupportedClient,
		};

		assert.doesNotThrow(() => createContainerRuntimeFactoryWithDefaultDataStore(props));
	});

	it("rejects a missing compatibility parameter", () => {
		assert.throws(() => {
			// @ts-expect-error A compatibility property is required.
			new ContainerRuntimeFactoryWithDefaultDataStore({
				...commonProps,
				defaultFactory,
			});
		}, /Specify exactly one/);
	});

	it("rejects both compatibility parameters", () => {
		assert.throws(() => {
			// @ts-expect-error Exactly one compatibility property may be supplied.
			new ContainerRuntimeFactoryWithDefaultDataStore({
				...commonProps,
				defaultFactory,
				oldestSupportedClient: defaultTestOldestSupportedClient,
				minVersionForCollab: defaultTestOldestSupportedClient,
			});
		}, /Specify exactly one/);
	});
});

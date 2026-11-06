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
	props: BaseContainerRuntimeFactoryProps,
): BaseContainerRuntimeFactory => new BaseContainerRuntimeFactory(props);

const createContainerRuntimeFactoryWithDefaultDataStore = (
	props: ContainerRuntimeFactoryWithDefaultDataStoreProps,
): ContainerRuntimeFactoryWithDefaultDataStore =>
	new ContainerRuntimeFactoryWithDefaultDataStore(props);

describe("BaseContainerRuntimeFactory compatibility parameter", () => {
	for (const property of ["oldestSupportedClient", "minVersionForCollab"] as const) {
		it(`rejects null for ${property}`, () => {
			const props: BaseContainerRuntimeFactoryProps = { ...commonProps };
			// @ts-expect-error A compatibility version must not be null.
			// eslint-disable-next-line unicorn/no-null -- Test invalid JavaScript input.
			props[property] = null;
			assert.throws(() => {
				new BaseContainerRuntimeFactory(props);
			}, /Compatibility version must not be null/);
		});

		it(`preserves extensible construction properties with ${property}`, () => {
			interface ExtendedProps extends BaseContainerRuntimeFactoryProps {
				readonly customProperty: boolean;
			}
			const props: ExtendedProps = {
				...commonProps,
				[property]: defaultTestOldestSupportedClient,
				customProperty: true,
			};

			assert.doesNotThrow(() => createBaseContainerRuntimeFactory(props));
		});
	}

	it("accepts an explicitly undefined canonical property with the deprecated property", () => {
		const props: BaseContainerRuntimeFactoryProps = {
			...commonProps,
			oldestSupportedClient: undefined,
			minVersionForCollab: defaultTestOldestSupportedClient,
		};

		assert.doesNotThrow(() => createBaseContainerRuntimeFactory(props));
	});

	it("rejects a missing compatibility parameter", () => {
		assert.throws(() => {
			new BaseContainerRuntimeFactory(commonProps);
		}, /Specify exactly one/);
	});

	it("rejects both compatibility parameters", () => {
		assert.throws(() => {
			new BaseContainerRuntimeFactory({
				...commonProps,
				oldestSupportedClient: defaultTestOldestSupportedClient,
				minVersionForCollab: defaultTestOldestSupportedClient,
			});
		}, /Specify exactly one/);
	});
});

describe("ContainerRuntimeFactoryWithDefaultDataStore compatibility parameter", () => {
	for (const property of ["oldestSupportedClient", "minVersionForCollab"] as const) {
		it(`rejects null for ${property}`, () => {
			const props: ContainerRuntimeFactoryWithDefaultDataStoreProps = {
				...commonProps,
				defaultFactory,
			};
			// @ts-expect-error A compatibility version must not be null.
			// eslint-disable-next-line unicorn/no-null -- Test invalid JavaScript input.
			props[property] = null;
			assert.throws(() => {
				new ContainerRuntimeFactoryWithDefaultDataStore(props);
			}, /Compatibility version must not be null/);
		});

		it(`preserves extensible construction properties with ${property}`, () => {
			interface ExtendedProps extends ContainerRuntimeFactoryWithDefaultDataStoreProps {
				readonly customProperty: boolean;
			}
			const props: ExtendedProps = {
				...commonProps,
				defaultFactory,
				[property]: defaultTestOldestSupportedClient,
				customProperty: true,
			};

			assert.doesNotThrow(() => createContainerRuntimeFactoryWithDefaultDataStore(props));
		});
	}

	it("accepts an explicitly undefined canonical property with the deprecated property", () => {
		const props: ContainerRuntimeFactoryWithDefaultDataStoreProps = {
			...commonProps,
			defaultFactory,
			oldestSupportedClient: undefined,
			minVersionForCollab: defaultTestOldestSupportedClient,
		};

		assert.doesNotThrow(() => createContainerRuntimeFactoryWithDefaultDataStore(props));
	});

	it("rejects a missing compatibility parameter", () => {
		assert.throws(() => {
			new ContainerRuntimeFactoryWithDefaultDataStore({
				...commonProps,
				defaultFactory,
			});
		}, /Specify exactly one/);
	});

	it("rejects both compatibility parameters", () => {
		assert.throws(() => {
			new ContainerRuntimeFactoryWithDefaultDataStore({
				...commonProps,
				defaultFactory,
				oldestSupportedClient: defaultTestOldestSupportedClient,
				minVersionForCollab: defaultTestOldestSupportedClient,
			});
		}, /Specify exactly one/);
	});
});

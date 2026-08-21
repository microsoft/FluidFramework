/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import type {
	IContainerContext,
	IRuntime,
	IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import type { IContainerRuntimeOptions } from "@fluidframework/container-runtime/internal";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import type { FluidObject } from "@fluidframework/core-interfaces";
// eslint-disable-next-line import-x/no-deprecated
import type { RuntimeRequestHandler } from "@fluidframework/request-handler/internal";
import type {
	IFluidDataStoreFactory,
	NamedFluidDataStoreRegistryEntries,
	OldestSupportedClientVersion,
} from "@fluidframework/runtime-definitions/internal";

import { defaultTestOldestSupportedClient } from "../containerRuntimeFactories.js";
import {
	type ContainerRuntimeFactoryWithDefaultDataStoreProps,
	createContainerRuntimeFactoryWithDefaultDataStore,
} from "../testContainerRuntimeFactoryWithDefaultDataStore.js";

class TestRuntimeFactory implements IRuntimeFactory {
	public get IRuntimeFactory(): IRuntimeFactory {
		return this;
	}

	public async instantiateRuntime(
		_context: IContainerContext,
		_existing: boolean,
	): Promise<IRuntime> {
		throw new Error("Not used by these tests");
	}
}

describe("createContainerRuntimeFactoryWithDefaultDataStore", () => {
	const defaultFactory: IFluidDataStoreFactory = {
		get IFluidDataStoreFactory() {
			return this;
		},
		type: "test",
		instantiateDataStore: async () => {
			throw new Error("Not used by these tests");
		},
	};
	const registryEntries = [] as NamedFluidDataStoreRegistryEntries;
	const runtimeOptions: IContainerRuntimeOptions = {};
	const provideEntryPoint = async (): Promise<FluidObject> => ({});
	const ctorProps = {
		defaultFactory,
		registryEntries,
		runtimeOptions,
		provideEntryPoint,
	} satisfies ContainerRuntimeFactoryWithDefaultDataStoreProps;

	it("constructs historical object-shaped factories", () => {
		let receivedProps: ContainerRuntimeFactoryWithDefaultDataStoreProps | undefined;
		class HistoricalObjectFactory extends TestRuntimeFactory {
			public constructor(props: ContainerRuntimeFactoryWithDefaultDataStoreProps) {
				super();
				receivedProps = props;
			}
		}

		const runtimeFactory = createContainerRuntimeFactoryWithDefaultDataStore(
			HistoricalObjectFactory,
			ctorProps,
		);

		assert(runtimeFactory instanceof HistoricalObjectFactory);
		assert.deepEqual(receivedProps, {
			...ctorProps,
			oldestSupportedClient: defaultTestOldestSupportedClient,
		});
	});

	it("constructs current object-shaped factories with the canonical compatibility value", () => {
		let receivedProps:
			| (ContainerRuntimeFactoryWithDefaultDataStoreProps & {
					readonly oldestSupportedClient: OldestSupportedClientVersion;
			  })
			| undefined;
		class CurrentObjectFactory extends TestRuntimeFactory {
			public constructor(
				props: ContainerRuntimeFactoryWithDefaultDataStoreProps & {
					readonly oldestSupportedClient: OldestSupportedClientVersion;
				},
			) {
				super();
				receivedProps = props;
			}
		}

		const runtimeFactory = createContainerRuntimeFactoryWithDefaultDataStore(
			CurrentObjectFactory,
			ctorProps,
		);

		assert(runtimeFactory instanceof CurrentObjectFactory);
		assert.equal(receivedProps?.oldestSupportedClient, defaultTestOldestSupportedClient);
	});

	it("constructs legacy positional factories", () => {
		let receivedArgs: readonly unknown[] | undefined;
		class PositionalFactory extends TestRuntimeFactory {
			public constructor(
				receivedDefaultFactory: IFluidDataStoreFactory,
				receivedRegistryEntries: NamedFluidDataStoreRegistryEntries,
				receivedDependencyContainer?: never,
				// eslint-disable-next-line import-x/no-deprecated
				receivedRequestHandlers: RuntimeRequestHandler[] = [],
				receivedRuntimeOptions?: IContainerRuntimeOptions,
				receivedProvideEntryPoint?: (runtime: IContainerRuntime) => Promise<FluidObject>,
			) {
				super();
				receivedArgs = [
					receivedDefaultFactory,
					receivedRegistryEntries,
					receivedDependencyContainer,
					receivedRequestHandlers,
					receivedRuntimeOptions,
					receivedProvideEntryPoint,
				];
			}
		}

		const runtimeFactory = createContainerRuntimeFactoryWithDefaultDataStore(
			PositionalFactory,
			ctorProps,
		);

		assert(runtimeFactory instanceof PositionalFactory);
		assert.deepEqual(receivedArgs, [
			defaultFactory,
			registryEntries,
			undefined,
			[],
			runtimeOptions,
			provideEntryPoint,
		]);
	});

	it("does not mask errors from object-shaped constructors", () => {
		const expectedError = new Error("constructor failed");
		class ThrowingObjectFactory extends TestRuntimeFactory {
			public constructor(_props: ContainerRuntimeFactoryWithDefaultDataStoreProps) {
				super();
				throw expectedError;
			}
		}

		assert.throws(
			() =>
				createContainerRuntimeFactoryWithDefaultDataStore(ThrowingObjectFactory, ctorProps),
			expectedError,
		);
	});
});

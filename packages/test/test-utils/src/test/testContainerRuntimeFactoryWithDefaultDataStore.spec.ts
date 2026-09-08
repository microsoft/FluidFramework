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
} from "@fluidframework/runtime-definitions/internal";

import {
	type ContainerRuntimeFactoryWithDefaultDataStoreProps,
	createContainerRuntimeFactoryWithDefaultDataStore,
} from "../testContainerRuntimeFactoryWithDefaultDataStore.js";
import { defaultTestOldestSupportedClient } from "../testCompatibility.js";

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
		oldestSupportedClient: defaultTestOldestSupportedClient,
		registryEntries,
		runtimeOptions,
		provideEntryPoint,
	} satisfies ContainerRuntimeFactoryWithDefaultDataStoreProps;

	it("constructs object-shaped factories with the explicit compatibility setting", () => {
		let receivedProps: ContainerRuntimeFactoryWithDefaultDataStoreProps | undefined;
		class ObjectFactory extends TestRuntimeFactory {
			public constructor(props: ContainerRuntimeFactoryWithDefaultDataStoreProps) {
				super();
				receivedProps = props;
			}
		}

		const runtimeFactory = createContainerRuntimeFactoryWithDefaultDataStore(
			ObjectFactory,
			ctorProps,
		);

		assert(runtimeFactory instanceof ObjectFactory);
		assert.deepEqual(receivedProps, ctorProps);
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

	it("rejects ambiguous zero-arity constructors", () => {
		class ObjectFactory extends TestRuntimeFactory {
			public constructor(_props: ContainerRuntimeFactoryWithDefaultDataStoreProps) {
				super();
			}
		}
		class ImplicitSubclass extends ObjectFactory {}

		assert.equal(ImplicitSubclass.length, 0);
		assert.throws(
			() => createContainerRuntimeFactoryWithDefaultDataStore(ImplicitSubclass, ctorProps),
			/Unsupported ContainerRuntimeFactoryWithDefaultDataStore constructor arity: 0/,
		);
	});
});

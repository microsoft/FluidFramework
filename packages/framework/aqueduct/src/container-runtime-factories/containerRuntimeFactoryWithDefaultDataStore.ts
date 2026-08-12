/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IContainerRuntime,
	// eslint-disable-next-line import-x/no-deprecated
	IContainerRuntimeWithResolveHandle_Deprecated,
} from "@fluidframework/container-runtime-definitions/internal";
import type { FluidObject, IRequest, IResponse } from "@fluidframework/core-interfaces";
import type {
	IFluidDataStoreFactory,
	OldestSupportedClientVersion,
} from "@fluidframework/runtime-definitions/internal";
import { RequestParser } from "@fluidframework/runtime-utils/internal";

import {
	BaseContainerRuntimeFactory,
	type BaseContainerRuntimeFactoryProps,
} from "./baseContainerRuntimeFactory.js";

const defaultDataStoreId = "default";

async function getDefaultFluidObject(runtime: IContainerRuntime): Promise<FluidObject> {
	const entryPoint = await runtime.getAliasedDataStoreEntryPoint("default");
	if (entryPoint === undefined) {
		throw new Error("default dataStore must exist");
	}
	return entryPoint.get();
}

/**
 * {@link ContainerRuntimeFactoryWithDefaultDataStore} construction properties.
 * @legacy
 * @beta
 */
export type ContainerRuntimeFactoryWithDefaultDataStoreProps = Omit<
	BaseContainerRuntimeFactoryProps,
	"minVersionForCollab" | "oldestSupportedClient" | "provideEntryPoint"
> & {
	defaultFactory: IFluidDataStoreFactory;
	/**
	 * Function that will initialize the entryPoint of the IContainerRuntime instances
	 * created with this factory
	 */
	provideEntryPoint?: (runtime: IContainerRuntime) => Promise<FluidObject>;
} & (
		| {
				/**
				 * Oldest version of Fluid Framework client that must be able to open and process
				 * documents written by this container runtime.
				 */
				oldestSupportedClient: OldestSupportedClientVersion;
				minVersionForCollab?: never;
		  }
		| {
				oldestSupportedClient?: never;
				/**
				 * Oldest version of Fluid Framework client that must be able to open and process
				 * documents written by this container runtime.
				 *
				 * @deprecated 2.116.0. To be removed in 3.10.0. Use `oldestSupportedClient` instead.
				 * See {@link https://github.com/microsoft/FluidFramework/issues/27851} for context.
				 */
				minVersionForCollab: OldestSupportedClientVersion;
		  }
	);

/**
 * A ContainerRuntimeFactory that initializes Containers with a single default data store, which can be requested from
 * the container with an empty URL.
 *
 * This factory should be exposed as fluidExport off the entry point to your module.
 * @legacy
 * @beta
 */
export class ContainerRuntimeFactoryWithDefaultDataStore extends BaseContainerRuntimeFactory {
	public static readonly defaultDataStoreId = defaultDataStoreId;

	protected readonly defaultFactory: IFluidDataStoreFactory;

	public constructor(props: ContainerRuntimeFactoryWithDefaultDataStoreProps) {
		const requestHandlers = props.requestHandlers ?? [];
		const provideEntryPoint = props.provideEntryPoint ?? getDefaultFluidObject;

		const getDefaultObject = async (
			request: IRequest,
			runtime: IContainerRuntime,
			// eslint-disable-next-line unicorn/consistent-function-scoping
		): Promise<IResponse | undefined> => {
			const parser = RequestParser.create(request);
			if (parser.pathParts.length === 0) {
				// This cast is safe as loadContainerRuntime is called in the base class
				// eslint-disable-next-line import-x/no-deprecated
				return (runtime as IContainerRuntimeWithResolveHandle_Deprecated).resolveHandle({
					url: `/${defaultDataStoreId}${parser.query}`,
					headers: request.headers,
				});
			}
			return undefined; // continue search
		};

		super({
			...props,
			requestHandlers: [getDefaultObject, ...requestHandlers],
			provideEntryPoint,
		});

		this.defaultFactory = props.defaultFactory;
	}

	/**
	 * {@inheritDoc BaseContainerRuntimeFactory.containerInitializingFirstTime}
	 */
	protected async containerInitializingFirstTime(runtime: IContainerRuntime): Promise<void> {
		const dataStore = await runtime.createDataStore(this.defaultFactory.type);
		await dataStore.trySetAlias(defaultDataStoreId);
	}
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ContainerRuntime } from "@fluidframework/container-runtime";
import { type IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { type IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { type FluidObject, type IRequest, type IResponse } from "@fluidframework/core-interfaces";
import { RequestParser } from "@fluidframework/runtime-utils";
import {
	BaseContainerRuntimeFactory,
	type BaseContainerRuntimeFactoryProps,
} from "./baseContainerRuntimeFactory";

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
 * @alpha
 */
export interface ContainerRuntimeFactoryWithDefaultDataStoreProps
	extends BaseContainerRuntimeFactoryProps {
	defaultFactory: IFluidDataStoreFactory;
}

/**
 * A ContainerRuntimeFactory that initializes Containers with a single default data store, which can be requested from
 * the container with an empty URL.
 *
 * This factory should be exposed as fluidExport off the entry point to your module.
 * @alpha
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
				// This cast is safe as ContainerRuntime.loadRuntime is called in the base class
				return (runtime as ContainerRuntime).resolveHandle({
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

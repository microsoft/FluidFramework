/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct/internal";
import {
	type IFluidCodeDetails,
	type ILoaderOptions,
	type IRuntimeFactory,
	ICodeDetailsLoader,
} from "@fluidframework/container-definitions/internal";
import type { ILoaderProps } from "@fluidframework/container-loader/internal";
import type {
	IDocumentServiceFactory,
	IUrlResolver,
} from "@fluidframework/driver-definitions/internal";
import {
	LocalDocumentServiceFactory,
	LocalResolver,
} from "@fluidframework/local-driver/internal";
import { SharedMap } from "@fluidframework/map/internal";
import type { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions/internal";
import { ILocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { LocalCodeLoader, TestFluidObjectFactory } from "@fluidframework/test-utils/internal";

/**
 * This allows the input object to be general,
 * and the default object to be specific,
 * which maintains strong typing for both inputs, and the defaults in the result.
 * So if a user specifies a value, that values type will be strongly specified on the Result.
 * However if the user does not specify an option input, the result will also get a strong
 * type based the default.
 */
export type OptionalToDefault<TInput, TDefault> = {
	[P in keyof TDefault]: P extends keyof TInput
		? Exclude<TInput[P], undefined> extends never
			? TDefault[P]
			: TInput[P]
		: TDefault[P];
};

export interface CreateLoaderParams {
	deltaConnectionServer: ILocalDeltaConnectionServer;
	codeDetails?: IFluidCodeDetails;
	defaultDataStoreFactory?: IFluidDataStoreFactory;
	runtimeFactory?: IRuntimeFactory;
	codeLoader?: ICodeDetailsLoader;
	documentServiceFactory?: IDocumentServiceFactory;
	urlResolver?: IUrlResolver;
	options?: ILoaderOptions;
}

export interface CreateLoaderDefaultResults
	extends Required<Omit<CreateLoaderParams, "options">> {
	documentServiceFactory: LocalDocumentServiceFactory;
	urlResolver: LocalResolver;
	codeLoader: LocalCodeLoader;
	defaultDataStoreFactory: TestFluidObjectFactory;
	runtimeFactory: IRuntimeFactory;
	loaderProps: ILoaderProps;
}

export function createLoader<T extends CreateLoaderParams>(
	opts: T,
): OptionalToDefault<T, CreateLoaderDefaultResults> {
	const deltaConnectionServer = opts.deltaConnectionServer;
	const documentServiceFactory =
		opts.documentServiceFactory ?? new LocalDocumentServiceFactory(deltaConnectionServer);

	const urlResolver = opts.urlResolver ?? new LocalResolver();

	const defaultDataStoreFactory =
		opts.defaultDataStoreFactory ??
		new TestFluidObjectFactory([["map", SharedMap.getFactory()]], "default");

	const runtimeFactory =
		opts.runtimeFactory ??
		new ContainerRuntimeFactoryWithDefaultDataStore({
			defaultFactory: defaultDataStoreFactory,
			registryEntries: [
				[defaultDataStoreFactory.type, Promise.resolve(defaultDataStoreFactory)],
			],
		});

	const codeDetails = opts.codeDetails ?? { package: "test" };

	const codeLoader = opts.codeLoader ?? new LocalCodeLoader([[codeDetails, runtimeFactory]]);

	const loaderProps = {
		codeLoader,
		documentServiceFactory,
		urlResolver,
	};

	const rtn: OptionalToDefault<CreateLoaderParams, CreateLoaderDefaultResults> = {
		deltaConnectionServer,
		documentServiceFactory,
		urlResolver,
		codeDetails,
		defaultDataStoreFactory,
		runtimeFactory,
		codeLoader,
		loaderProps,
	};
	return rtn as OptionalToDefault<T, CreateLoaderDefaultResults>;
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ILayerCompatDetails } from "@fluid-internal/client-utils";
import type { FluidObject, ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import type { IDocumentStorageService } from "@fluidframework/driver-definitions/internal";
import {
	CreateSummarizerNodeSource,
	type CreateChildSummarizerNodeFn,
	type IFluidDataStoreContext,
	type IFluidDataStoreFactory,
	type IFluidDataStoreRegistry,
	type IFluidParentContext,
	type IGarbageCollectionData,
	type ISummarizerNodeWithGC,
	type SummarizeInternalFn,
} from "@fluidframework/runtime-definitions/internal";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";
import {
	MockDeltaManager,
	MockFluidDataStoreRuntime,
} from "@fluidframework/test-runtime-utils/internal";

import {
	LocalFluidDataStoreContext,
	type ILocalFluidDataStoreContextProps,
} from "../dataStoreContext.js";
import {
	createRootSummarizerNodeWithGC,
	type IRootSummarizerNodeWithGC,
} from "../summary/index.js";

export function createParentContext(
	logger: ITelemetryBaseLogger = createChildLogger(),
	clientDetails = {} as unknown as IFluidParentContext["clientDetails"],
	compatDetails?: ILayerCompatDetails,
): IFluidParentContext {
	const factory: IFluidDataStoreFactory = {
		type: "store-type",
		get IFluidDataStoreFactory() {
			return factory;
		},
		instantiateDataStore: async (context: IFluidDataStoreContext) => {
			const mockDataStoreRuntime = new MockFluidDataStoreRuntime();
			if (compatDetails !== undefined) {
				mockDataStoreRuntime.ILayerCompatDetails = compatDetails;
			}
			return mockDataStoreRuntime;
		},
	};
	const registry: IFluidDataStoreRegistry = {
		get IFluidDataStoreRegistry() {
			return registry;
		},
		get: async (pkg) => (pkg === "BOGUS" ? undefined : factory),
	};
	return {
		IFluidDataStoreRegistry: registry,
		baseLogger: logger,
		clientDetails,
		submitMessage: () => {},
		deltaManager: new MockDeltaManager(),
	} satisfies Partial<IFluidParentContext> as unknown as IFluidParentContext;
}

export function createSummarizerNodeAndGetCreateFn(dataStoreId: string): {
	summarizerNode: IRootSummarizerNodeWithGC;
	createSummarizerNodeFn: CreateChildSummarizerNodeFn;
} {
	const summarizerNode = createRootSummarizerNodeWithGC(
		createChildLogger(),
		(() => undefined) as unknown as SummarizeInternalFn,
		0,
		0,
	);
	summarizerNode.startSummary(0, createChildLogger(), 0);

	const createSummarizerNodeFn = (
		summarizeInternal: SummarizeInternalFn,
		getGCDataFn: () => Promise<IGarbageCollectionData>,
	): ISummarizerNodeWithGC =>
		summarizerNode.createChild(
			summarizeInternal,
			dataStoreId,
			{ type: CreateSummarizerNodeSource.Local },
			undefined,
			getGCDataFn,
		);
	return { summarizerNode, createSummarizerNodeFn };
}

const defaultCreateProps = {
	id: "dataStoreId",
	pkg: ["dataStorePkg"],
	storage: {} as unknown as IDocumentStorageService,
	scope: {} as unknown as FluidObject,
	snapshotTree: undefined,
	makeLocallyVisibleFn: () => {},
};

export function createLocalDataStoreContext(
	props: Partial<ILocalFluidDataStoreContextProps>,
	compatDetails?: ILayerCompatDetails,
): LocalFluidDataStoreContext {
	const localProps: ILocalFluidDataStoreContextProps = {
		...defaultCreateProps,
		...props,
		parentContext:
			props.parentContext ?? createParentContext(undefined, undefined, compatDetails),
		createSummarizerNodeFn:
			props.createSummarizerNodeFn ??
			createSummarizerNodeAndGetCreateFn(props.id ?? defaultCreateProps.id)
				.createSummarizerNodeFn,
	};
	return new LocalFluidDataStoreContext(localProps);
}

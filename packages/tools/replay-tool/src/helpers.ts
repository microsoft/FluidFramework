/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict } from "assert";
import fs from "fs";
import { IContainer } from "@fluidframework/container-definitions";
import { ILoaderOptions, Loader } from "@fluidframework/container-loader";
import { ContainerRuntime, IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { IDocumentServiceFactory, IResolvedUrl } from "@fluidframework/driver-definitions";
import { IFileSnapshot } from "@fluidframework/replay-driver";
import { ConfigTypes, IConfigProviderBase, TelemetryLogger } from "@fluidframework/telemetry-utils";
import { getNormalizedSnapshot, ISnapshotNormalizerConfig } from "@fluidframework/tool-utils";
import stringify from "json-stable-stringify";
import { FluidObject } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/common-utils";
import {
	excludeChannelContentDdsFactories,
	ReplayDataStoreFactory,
	ReplayRuntimeFactory,
} from "./replayFluidFactories";
import { ReplayCodeLoader, ReplayUrlResolver } from "./replayLoaderObject";
import { mixinDataStoreWithAnyChannel } from "./unknownChannel";

export interface ReplayToolContainerEntryPoint {
	readonly containerRuntime: ContainerRuntime;
	readonly ReplayToolContainerEntryPoint: ReplayToolContainerEntryPoint;
}

const normalizeOpts: ISnapshotNormalizerConfig = {
	excludedChannelContentTypes: excludeChannelContentDdsFactories.map((f) => f.type),
};
/**
 * Helper function that normalizes the snapshot trees in the given file snapshot.
 * @returns the normalized file snapshot.
 */
export function getNormalizedFileSnapshot(snapshot: IFileSnapshot): IFileSnapshot {
	const normalizedSnapshot: IFileSnapshot = {
		commits: {},
		tree: getNormalizedSnapshot(snapshot.tree, normalizeOpts),
	};
	for (const commit of Object.keys(snapshot.commits)) {
		normalizedSnapshot.commits[commit] = getNormalizedSnapshot(
			snapshot.commits[commit],
			normalizeOpts,
		);
	}
	return normalizedSnapshot;
}

export function compareWithReferenceSnapshot(
	snapshot: IFileSnapshot,
	referenceSnapshotFilename: string,
	errorHandler: (description: string, error?: any) => void,
) {
	// Read the reference snapshot and covert it to normalized IFileSnapshot.
	const referenceSnapshotString = fs.readFileSync(`${referenceSnapshotFilename}.json`, "utf-8");
	const referenceSnapshot = JSON.parse(referenceSnapshotString);

	/**
	 * The packageVersion of the snapshot could be different from the reference snapshot. Replace all package
	 * package versions with X before we compare them.
	 *
	 * @example
	 * This is how it will look:
	 * Before replace:
	 *
	 * ```
	 * "{\"type\":\"https://graph.microsoft.com/types/map\",\"packageVersion\":\"0.28.0-214\"}"
	 * ```
	 *
	 * After replace:
	 *
	 * ```
	 * "{\"type\":\"https://graph.microsoft.com/types/map\",\"packageVersion\":\"X\"}"
	 * ```
	 */
	const packageVersionRegex = /\\"packageversion\\":\\"[^"]+\\"/gi;
	const packageVersionPlaceholder = '\\"packageVersion\\":\\"X\\"';

	const normalizedSnapshot = JSON.parse(
		stringify(getNormalizedFileSnapshot(snapshot), { space: 2 }).replace(
			packageVersionRegex,
			packageVersionPlaceholder,
		),
	);
	const normalizedReferenceSnapshot = JSON.parse(
		stringify(getNormalizedFileSnapshot(referenceSnapshot), { space: 2 }).replace(
			packageVersionRegex,
			packageVersionPlaceholder,
		),
	);

	// Put the assert in a try catch block, so that we can report errors, if any.
	try {
		strict.deepStrictEqual(normalizedSnapshot, normalizedReferenceSnapshot);
	} catch (error) {
		errorHandler(`Mismatch in snapshot ${referenceSnapshotFilename}.json`, error);
	}
}

export async function loadContainer(
	documentServiceFactory: IDocumentServiceFactory,
	documentName: string,
	strictChannels: boolean,
	logger?: TelemetryLogger,
	loaderOptions?: ILoaderOptions,
): Promise<IContainer> {
	const resolved: IResolvedUrl = {
		endpoints: {
			deltaStorageUrl: "example.com",
			ordererUrl: "example.com",
			storageUrl: "example.com",
		},
		id: documentName,
		tokens: {},
		type: "fluid",
		url: `fluid-file://localhost:6000/fluid/${documentName}`,
	};
	const urlResolver = new ReplayUrlResolver(
		new Map<string, IResolvedUrl>([[resolved.url, resolved]]),
	);

	const dataStoreFactory = new ReplayDataStoreFactory(
		strictChannels ? undefined : mixinDataStoreWithAnyChannel(),
	);
	// List of data store registries in container runtime.
	const dataStoreRegistries = new Map([
		["_scheduler", Promise.resolve(dataStoreFactory)],
		["@ms/atmentions", Promise.resolve(dataStoreFactory)],
		["@ms/augloop", Promise.resolve(dataStoreFactory)],
		["@ms/catalog", Promise.resolve(dataStoreFactory)],
		["@ms/scriptor", Promise.resolve(dataStoreFactory)],
		["@ms/discover", Promise.resolve(dataStoreFactory)],
		["@ms/registro", Promise.resolve(dataStoreFactory)],
		["@ms/formula", Promise.resolve(dataStoreFactory)],
		["@ms/application-services", Promise.resolve(dataStoreFactory)],
		["@ms/undo-stack", Promise.resolve(dataStoreFactory)],
		["@ms/commanding-surface", Promise.resolve(dataStoreFactory)],
		["@ms/dias", Promise.resolve(dataStoreFactory)],
		["@ms/scriptor/Titulo", Promise.resolve(dataStoreFactory)],
		["@fluidx/tasks", Promise.resolve(dataStoreFactory)],
		["@ms/tablero/TableroView", Promise.resolve(dataStoreFactory)],
		["@ms/tablero/TableroDocument", Promise.resolve(dataStoreFactory)],
		["@fluid-example/table-document/TableDocument", Promise.resolve(dataStoreFactory)],
		["LastEditedComponent", Promise.resolve(dataStoreFactory)],
		["OfficeRootComponent", Promise.resolve(dataStoreFactory)],
		["OneNoteRootComponentType", Promise.resolve(dataStoreFactory)],
	]);

	// Older snapshots may not contain summary acks, so the summarizer will throw error in case it faces more
	// ops than "maxOpsSinceLastSummary". So set it to a higher number to suppress those errors and run tests.
	const runtimeOptions: IContainerRuntimeOptions = {
		summaryOptions: {
			summaryConfigOverrides: {
				state: "disabled",
			},
		},
	};
	const codeLoader = new ReplayCodeLoader(
		new ReplayRuntimeFactory(runtimeOptions, dataStoreRegistries),
	);

	// Add a config provider to the Loader to enable / disable features.
	const settings: Record<string, ConfigTypes> = {};
	const configProvider: IConfigProviderBase = {
		getRawConfig: (name: string): ConfigTypes => settings[name],
	};
	// Enable GCVersionUpgradeToV3 feature. This is for the snapshot tests which are already using GC version 3
	// but the default version was changed to 2. Once the default is 3, this will be removed.
	settings["Fluid.GarbageCollection.GCVersionUpgradeToV3"] = true;

	// Load the Fluid document while forcing summarizeProtocolTree option
	const loader = new Loader({
		urlResolver,
		documentServiceFactory,
		codeLoader,
		options: loaderOptions
			? { ...loaderOptions, summarizeProtocolTree: true }
			: { summarizeProtocolTree: true },
		logger,
		configProvider,
	});

	return loader.resolve({ url: resolved.url });
}

export async function uploadSummary(container: IContainer) {
	const entryPoint: FluidObject<ReplayToolContainerEntryPoint> = await container.getEntryPoint();
	const runtime = entryPoint?.ReplayToolContainerEntryPoint?.containerRuntime;
	assert(runtime !== undefined, 0x5a7 /* ContainerRuntime entryPoint was not initialized */);
	const summaryResult = await runtime.summarize({
		fullTree: true,
		trackState: false,
		fullGC: true,
	});
	return runtime.storage.uploadSummaryWithContext(summaryResult.summary, {
		referenceSequenceNumber: 0,
		proposalHandle: undefined,
		ackHandle: undefined,
	});
}

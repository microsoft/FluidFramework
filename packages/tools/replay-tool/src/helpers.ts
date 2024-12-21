/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict } from "assert";
import fs from "fs";

import { IContainer, ILoaderOptions } from "@fluidframework/container-definitions/internal";
import { Loader } from "@fluidframework/container-loader/internal";
import {
	ContainerRuntime,
	IContainerRuntimeOptions,
} from "@fluidframework/container-runtime/internal";
import {
	ConfigTypes,
	FluidObject,
	IConfigProviderBase,
	type ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import {
	IDocumentServiceFactory,
	IResolvedUrl,
} from "@fluidframework/driver-definitions/internal";
import { IFileSnapshot } from "@fluidframework/replay-driver/internal";
import {
	ISnapshotNormalizerConfig,
	getNormalizedSnapshot,
} from "@fluidframework/tool-utils/internal";
import stringify from "json-stable-stringify";

import {
	ReplayDataStoreFactory,
	ReplayRuntimeFactory,
	excludeChannelContentDdsFactories,
} from "./replayFluidFactories.js";
import { ReplayCodeLoader, ReplayUrlResolver } from "./replayLoaderObject.js";
import { mixinDataStoreWithAnyChannel } from "./unknownChannel.js";

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
 * @internal
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

/**
 * @internal
 */
export function compareWithReferenceSnapshot(
	snapshot: IFileSnapshot,
	referenceSnapshotFilename: string,
	errorHandler: (description: string, error?: any) => void,
) {
	// Read the reference snapshot and covert it to normalized IFileSnapshot.
	const referenceSnapshotString = fs.readFileSync(
		`${referenceSnapshotFilename}.json`,
		"utf-8",
	);
	const referenceSnapshot = JSON.parse(referenceSnapshotString);

	/**
	 * The packageVersion of the snapshot could be different from the reference snapshot. Replace all package
	 * package versions with X before we compare them.
	 *
	 * @example
	 *
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

/**
 * @internal
 */
export async function loadContainer(
	documentServiceFactory: IDocumentServiceFactory,
	documentName: string,
	strictChannels: boolean,
	logger?: ITelemetryBaseLogger,
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
	// This is to align with the snapshot tests which may upgrade GC Version before the default is changed.
	settings["Fluid.GarbageCollection.GCVersionUpgradeToV4"] = false;
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

/**
 * @internal
 */
export async function uploadSummary(container: IContainer) {
	const entryPoint: FluidObject<ReplayToolContainerEntryPoint> =
		await container.getEntryPoint();
	const runtime = entryPoint?.ReplayToolContainerEntryPoint?.containerRuntime;
	assert(runtime !== undefined, 0x5a7 /* ContainerRuntime entryPoint was not initialized */);
	const summaryResult = await runtime.summarize({
		fullTree: true,
		fullGC: true,
	});
	return runtime.storage.uploadSummaryWithContext(summaryResult.summary, {
		referenceSequenceNumber: 0,
		proposalHandle: undefined,
		ackHandle: undefined,
	});
}

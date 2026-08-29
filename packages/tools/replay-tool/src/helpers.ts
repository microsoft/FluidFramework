/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict } from "assert";
import fs from "fs";
import { stripVTControlCharacters } from "node:util";

import type {
	IContainer,
	ILoaderOptions,
} from "@fluidframework/container-definitions/internal";
import { Loader } from "@fluidframework/container-loader/internal";
import type {
	ContainerRuntime,
	IContainerRuntimeOptions,
} from "@fluidframework/container-runtime/internal";
import type {
	ConfigTypes,
	FluidObject,
	IConfigProviderBase,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import type {
	IDocumentServiceFactory,
	IResolvedUrl,
} from "@fluidframework/driver-definitions/internal";
import type { IFileSnapshot } from "@fluidframework/replay-driver/internal";
import {
	type ISnapshotNormalizerConfig,
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
 * Replaces all `packageVersion` values inside JSON-encoded blob contents with a stable
 * placeholder, so snapshots produced by different runtime versions can be compared without
 * failing solely on the embedded version string.
 *
 * @example
 *
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
 *
 * @internal
 */
export function normalizePackageVersions(snapshot: IFileSnapshot): IFileSnapshot {
	const packageVersionRegex = /\\"packageversion\\":\\"[^"]+\\"/gi;
	const packageVersionPlaceholder = '\\"packageVersion\\":\\"X\\"';
	return JSON.parse(
		stringify(snapshot, { space: 2 }).replace(packageVersionRegex, packageVersionPlaceholder),
	) as IFileSnapshot;
}

/**
 * Configures how a generated snapshot is compared with its reference snapshot.
 *
 * @internal
 */
export interface SnapshotComparisonOptions {
	/**
	 * Top-level blob paths that may exist only in the reference snapshot because the source
	 * data cannot reconstruct their state. If the generated snapshot contains a listed path,
	 * its contents are compared strictly.
	 */
	readonly allowedReferenceOnlyBlobPaths: readonly string[];
}

/**
 * Returns a shallow copy of the snapshot with the named top-level blobs removed.
 */
function withoutTopLevelBlobs(
	snapshot: IFileSnapshot,
	blobPaths: readonly string[],
): IFileSnapshot {
	if (blobPaths.length === 0) {
		return snapshot;
	}
	const ignoredPaths = new Set(blobPaths);
	return {
		commits: snapshot.commits,
		tree: {
			...snapshot.tree,
			entries: snapshot.tree.entries.filter((entry) => !ignoredPaths.has(entry.path)),
		},
	};
}

/**
 * Compares a snapshot against a reference snapshot file and reports any differences.
 *
 * @param options - Controls explicitly allowed differences between the generated and reference
 * snapshots.
 *
 * @internal
 */
export function compareWithReferenceSnapshot(
	snapshot: IFileSnapshot,
	referenceSnapshotFilename: string,
	errorHandler: (description: string, error?: any) => void,
	options: SnapshotComparisonOptions,
): void {
	// Read the reference snapshot and covert it to normalized IFileSnapshot.
	const referenceSnapshotString = fs.readFileSync(
		`${referenceSnapshotFilename}.json`,
		"utf-8",
	);
	const referenceSnapshot = JSON.parse(referenceSnapshotString) as IFileSnapshot;

	const normalizedSnapshot = normalizePackageVersions(getNormalizedFileSnapshot(snapshot));
	const generatedSnapshotBlobPaths = new Set(
		normalizedSnapshot.tree.entries.map((entry) => entry.path),
	);
	const normalizedReferenceSnapshot = normalizePackageVersions(
		withoutTopLevelBlobs(
			getNormalizedFileSnapshot(referenceSnapshot),
			options.allowedReferenceOnlyBlobPaths.filter(
				(path) => !generatedSnapshotBlobPaths.has(path),
			),
		),
	);

	// Put the assert in a try catch block, so that we can report errors, if any.
	try {
		strict.deepStrictEqual(normalizedSnapshot, normalizedReferenceSnapshot);
	} catch (error) {
		if (error instanceof Error) {
			error.message = stripVTControlCharacters(error.message);
			if (error.stack !== undefined) {
				error.stack = stripVTControlCharacters(error.stack);
			}
		}
		errorHandler(`Mismatch in snapshot ${referenceSnapshotFilename}.json`, error);
	}
}

/**
 * Loads a Fluid container using the provided document service factory and configuration.
 *
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
	const settings: Record<string, ConfigTypes> = {
		// This is to enable single-commit-summaries in loader layer
		"Fluid.Container.summarizeProtocolTree2": true,
		// This is to align with the snapshot tests which may upgrade GC Version before the default is changed.
		"Fluid.GarbageCollection.GCVersionUpgradeToV4": false,
	};
	const configProvider: IConfigProviderBase = {
		getRawConfig: (name: string): ConfigTypes => settings[name],
	};

	// Load the Fluid document while forcing summarizeProtocolTree option
	const loader = new Loader({
		urlResolver,
		documentServiceFactory,
		codeLoader,
		options: loaderOptions ? { ...loaderOptions } : {},
		logger,
		configProvider,
	});

	return loader.resolve({ url: resolved.url });
}

/**
 * Generates and uploads a summary for the given container.
 *
 * @internal
 */
export async function uploadSummary(container: IContainer): Promise<string> {
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

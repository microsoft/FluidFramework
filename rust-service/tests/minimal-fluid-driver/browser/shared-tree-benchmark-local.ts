/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConnectionState } from "@fluidframework/container-loader";
import { Loader } from "@fluidframework/container-loader/internal";
import type { IClient } from "@fluidframework/driver-definitions/internal";
import {
	createDOProviderContainerRuntimeFactory,
	createFluidContainer,
} from "@fluidframework/fluid-static/internal";
import { LocalSessionStorageDbFactory } from "@fluidframework/local-driver/internal";
import {
	createLocalResolverCreateNewRequest,
	LocalDocumentServiceFactory,
	LocalResolver,
} from "@fluidframework/local-driver/legacy";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";

import { adaptInitialObject, parseBenchmarkDataStructure } from "./benchmark-data-object.js";
import {
	runSharedTreeBenchmark,
	type SharedTreeBenchmarkPair,
} from "./shared-tree-benchmark-core.js";
import {
	benchmarkContainerSchema,
	benchmarkTreeConfiguration,
} from "./shared-tree-benchmark-schema.js";

/** Browser result hook read by the headless benchmark runner. */
declare global {
	/** Benchmark-specific browser globals. */
	interface Window {
		/** Promise resolving to the detailed benchmark sample. */
		__sharedTreeBenchmarkResult?: Promise<Record<string, unknown>>;
	}
}

/** Browser query parameters supplied by the headless benchmark runner. */
const parameters = new URLSearchParams(location.search);
/** DDS implementation selected for this benchmark sample. */
const dataStructure = parseBenchmarkDataStructure(parameters.get("dds"));
/** Fluid code identity shared by both local-service benchmark containers. */
const codeDetails = { package: "shared-tree-local-service-benchmark", config: {} };

/** Waits for a local-driver container to reach Fluid's connected state. */
async function waitForConnected(container: {
	readonly connectionState: ConnectionState;
	on(event: "connected", listener: () => void): void;
	off(event: "connected", listener: () => void): void;
}): Promise<void> {
	if (container.connectionState === ConnectionState.Connected) {
		return;
	}
	await new Promise<void>((resolve, reject) => {
		const timeout = setTimeout(() => {
			container.off("connected", connected);
			reject(new Error("timed out waiting for the local-service container to connect"));
		}, 10_000);
		const connected = (): void => {
			clearTimeout(timeout);
			container.off("connected", connected);
			resolve();
		};
		container.on("connected", connected);
	});
}

/** Creates the two-client TypeScript local-service benchmark backend. */
async function createPair(): Promise<SharedTreeBenchmarkPair> {
	const documentId = `shared-tree-local-${Date.now()}`;
	const urlResolver = new LocalResolver();
	const localServer = LocalDeltaConnectionServer.create(new LocalSessionStorageDbFactory());
	const documentServiceFactory = new LocalDocumentServiceFactory(localServer);
	const containerSchema = benchmarkContainerSchema(dataStructure);
	const runtimeFactory = createDOProviderContainerRuntimeFactory({
		schema: containerSchema,
		minVersionForCollaboration: "2.0.0",
		runtimeOptionOverrides: {
			summaryOptions: { summaryConfigOverrides: { state: "disabled" } },
		},
	});
	const codeLoader = {
		load: async () => ({ module: { fluidExport: runtimeFactory }, details: codeDetails }),
	};
	const client: IClient = {
		details: { capabilities: { interactive: true } },
		permission: [],
		scopes: [],
		user: { id: "shared-tree-local-benchmark" },
		mode: "write",
	};
	const makeLoader = (): Loader =>
		new Loader({ urlResolver, documentServiceFactory, codeLoader, options: { client } });

	const firstContainer = await makeLoader().createDetachedContainer(codeDetails);
	const firstFluidContainer = await createFluidContainer<typeof containerSchema>({
		container: firstContainer,
	});
	const firstData = adaptInitialObject(
		firstFluidContainer.initialObjects.data,
		dataStructure,
		true,
		benchmarkTreeConfiguration,
	);
	await firstContainer.attach(createLocalResolverCreateNewRequest(documentId));
	await waitForConnected(firstContainer);

	const secondContainer = await makeLoader().resolve({
		url: `https://localhost/${documentId}`,
	});
	await waitForConnected(secondContainer);
	const secondFluidContainer = await createFluidContainer<typeof containerSchema>({
		container: secondContainer,
	});
	const secondData = adaptInitialObject(
		secondFluidContainer.initialObjects.data,
		dataStructure,
		false,
		benchmarkTreeConfiguration,
	);

	return {
		dataStructure,
		backend: "local-driver-local-service",
		clientCount: 2,
		applyEdit: (clientIndex, value) => (clientIndex === 0 ? firstData : secondData).set(value),
		appliedEditCounts: () => [firstData.appliedOpCount, secondData.appliedOpCount],
		lastValues: () => [firstData.value, secondData.value],
		synchronize: async () => {},
		close: async () => {
			firstData.dispose();
			secondData.dispose();
			firstContainer.close();
			secondContainer.close();
			await localServer.close();
		},
		metrics: () => ({
			browser: navigator.userAgent,
			wireBytes: null,
			peakResponseBytes: null,
			peakSubscriptionFrameBytes: null,
			peakSubscriptionQueueDepth: null,
			resumeOpenMilliseconds: null,
			resumeFirstDeliveryMilliseconds: null,
			resumeCursorCount: null,
			forceWriteConnection: false,
		}),
	};
}

/** Reads a numeric browser parameter or returns its workload default. */
function numberParameter(name: string, fallback: number): number {
	const value = parameters.get(name);
	return value === null ? fallback : Number(value);
}

window.__sharedTreeBenchmarkResult = runSharedTreeBenchmark(createPair, {
	operationCount: numberParameter("operations", 10_000),
	warmupOperationCount: numberParameter("warmup", 1_000),
	operationsPerTurn: numberParameter("operationsPerTurn", Number.POSITIVE_INFINITY),
	synchronizePerTurn: parameters.get("synchronizePerTurn") === "true",
}).catch((error: unknown) => ({
	status: "failed",
	error: String(error),
}));

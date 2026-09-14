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

declare global {
	interface Window {
		__sharedTreeBenchmarkResult?: Promise<Record<string, unknown>>;
	}
}

const parameters = new URLSearchParams(location.search);
const dataStructure = parseBenchmarkDataStructure(parameters.get("dds"));
const codeDetails = { package: "shared-tree-local-service-benchmark", config: {} };

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

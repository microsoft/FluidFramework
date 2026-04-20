/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DocumentType, DocumentTypeInfo } from "@fluid-private/test-version-utils";
import {
	type BenchmarkTimer,
	MemoryUseCallbacks,
	Phase,
	benchmarkDuration,
	benchmarkIt,
	benchmarkMemoryUse,
	isInPerformanceTestingMode,
} from "@fluid-tools/benchmark";
import { IContainer } from "@fluidframework/container-definitions/internal";
import { ISummarizer } from "@fluidframework/container-runtime/internal";
import {
	ITelemetryLoggerExt,
	createChildLogger,
} from "@fluidframework/telemetry-utils/internal";
import { ITestObjectProvider } from "@fluidframework/test-utils/internal";

import { DocumentMap } from "./DocumentMap.js";
import { DocumentMatrix } from "./DocumentMatrix.js";
import { DocumentMatrixPlain } from "./DocumentMatrixPlain.js";
import { DocumentMultipleDds } from "./DocumentMultipleDataStores.js";

export interface IDocumentCreatorProps {
	testName: string;
	provider: ITestObjectProvider;
	documentType: DocumentType;
	documentTypeInfo: DocumentTypeInfo;
}

export interface IDocumentProps extends IDocumentCreatorProps {
	logger: ITelemetryLoggerExt | undefined;
}

export interface ISummarizeResult {
	container: IContainer;
	summarizer: ISummarizer;
	summaryVersion: string;
}

export interface IDocumentLoader {
	mainContainer: IContainer | undefined;
	logger: ITelemetryLoggerExt | undefined;
	initializeDocument(): Promise<void>;
	loadDocument(): Promise<IContainer>;
}
export interface IDocumentLoaderAndSummarizer extends IDocumentLoader {
	summarize(
		_container: IContainer | undefined,
		summaryVersion?: string,
		closeContainer?: boolean,
	): Promise<ISummarizeResult>;
}

/**
 * Creates a new {@link DocumentMap} using configuration parameters.
 * @param props - Properties for initializing the Document Creator.
 */
export function createDocument(props: IDocumentCreatorProps): IDocumentLoaderAndSummarizer {
	const logger = createChildLogger({
		logger: getTestLogger?.(),
		properties: {
			all: {
				namespace: "FFEngineering",
				driverType: props.provider.driver.type,
				driverEndpointName: props.provider.driver.endpointName,
				testDocument: props.testName,
				testDocumentType: props.documentType,
				details: JSON.stringify(props.documentTypeInfo),
			},
		},
	});
	const documentProps: IDocumentProps = { ...props, logger };

	switch (props.documentType) {
		case "DocumentMap":
			return new DocumentMap(documentProps);
		case "DocumentMultipleDataStores":
			return new DocumentMultipleDds(documentProps);
		case "DocumentMatrix":
			return new DocumentMatrix(documentProps);
		case "DocumentMatrixPlain":
			return new DocumentMatrixPlain(documentProps);
		default:
			throw new Error("Invalid document type");
	}
}

export interface IBenchmarkParameters {
	/**
	 * The minimum number of samples to collect for this benchmark.
	 * @remarks
	 * Slow benchmarks can provide a small number here to to speed up the test by opting into allowing noisier results by taking fewer samples.
	 */
	readonly minSampleCount?: number;
	/**
	 * The main function that will be executed for each benchmark iteration.
	 */
	readonly run: () => Promise<void>;
	/**
	 * Run once before any of the benchmark iterations start.
	 */
	readonly before?: () => Promise<void>;
}
/**
 * In order to share the files between memory and benchmark tests, we need to create a test object that can be passed and used
 * in both tests. This function creates the test object and calls the appropriate test function.
 * @param title - The title of the test.
 * @param createObj - Factory that creates a fresh test object for each test type (memory and duration).
 */
export function benchmarkAll<T extends IBenchmarkParameters>(
	title: string,
	createObj: () => T,
): void {
	// In performance testing mode, the tests are much longer
	// and the mocharc sets a much longer timeout per test accordingly.
	// Calling .timeout() on the returned test overrides that,
	// so we need to provide suitable timeouts for both cases here.
	// As some of these tests do lot of operations to rather large data sets,
	// they are quite slow and need long timeouts.
	const timeout = isInPerformanceTestingMode ? 1_000_000 : 20_000;

	{
		const obj = createObj();
		benchmarkIt({
			title,
			...benchmarkMemoryUse({
				// These tests are quite slow, so force a really low iteration count.
				// If we need better data at some point, we can look into raising it.
				keepIterations: Math.min(obj.minSampleCount ?? 1, 1),
				warmUpIterations: (obj.minSampleCount ?? 1) > 1 ? 1 : 0,
				benchmarkFn: async (state: MemoryUseCallbacks) => {
					await obj.before?.();
					while (state.continue()) {
						await state.beforeAllocation();
						await obj.run();
						await state.whileAllocated();
					}
				},
			}),
		}).timeout(timeout);
	}

	{
		const obj = createObj();
		benchmarkIt({
			title,
			...benchmarkDuration({
				benchmarkFnCustom: async <T1>(state: BenchmarkTimer<T1>) => {
					await obj.before?.();
					let duration: number;
					do {
						const before = state.timer.now();
						await obj.run();
						const after = state.timer.now();
						duration = state.timer.toSeconds(before, after);
						// Collect data
					} while (state.recordBatch(duration));
				},
				// Force batch size to be always 1
				minBatchDurationSeconds: 0,
				...(obj.minSampleCount !== undefined ? { minBatchCount: obj.minSampleCount } : {}),
				// No need to warm up
				startPhase: Phase.CollectData,
			}),
		}).timeout(timeout);
	}
}

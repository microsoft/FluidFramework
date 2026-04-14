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
	readonly minSampleCount?: number;
	readonly run: () => Promise<void>;
	readonly beforeIteration?: () => void;
	readonly afterIteration?: () => void;
	readonly before?: () => Promise<void>;
	readonly after?: () => Promise<void>;
	readonly beforeEachBatch?: () => void;
}
/**
 * In order to share the files between memory and benchmark tests, we need to create a test object that can be passed and used
 * in both tests. This function creates the test object and calls the appropriate test function.
 * @param title - The title of the test.
 * @param obj - The test object that will be persisted across runs (mainly used on Memory runs).
 * @param params - The {@link IBenchmarkParameters} parameters for the test.
 */
export function benchmarkAll<T extends IBenchmarkParameters>(title: string, obj: T): void {
	const runMethod = obj.run.bind(obj);
	const beforeIterationMethod = obj.beforeIteration?.bind(obj);
	const afterIterationMethod = obj.afterIteration?.bind(obj);
	const beforeMethod = obj.before?.bind(obj);
	const afterMethod = obj.after?.bind(obj);

	// In performance testing mode, the tests are much longer
	// and the mocharc sets a much longer timeout per test accordingly.
	// Calling .timeout() on the returned test overrides that,
	// so we need to provide suitable timouts for both cases here.
	// As some of these tests do lot of operations to rather large data sets,
	// they are quite slow and need long timouts.
	const timeout = isInPerformanceTestingMode ? 1_000_000 : 20_000;

	benchmarkIt({
		title,
		...benchmarkMemoryUse({
			benchmarkFn: async (state: MemoryUseCallbacks) => {
				await beforeMethod?.();
				while (state.continue()) {
					beforeIterationMethod?.();
					await state.beforeAllocation();
					{
						await runMethod();
						await state.whileAllocated();
						afterIterationMethod?.();
					}
					await state.afterDeallocation();
				}
				await afterMethod?.();
			},
		}),
	}).timeout(timeout);

	benchmarkIt({
		title,
		...benchmarkDuration({
			benchmarkFnCustom: async <T1>(state: BenchmarkTimer<T1>) => {
				let duration: number;
				do {
					await beforeMethod?.();
					const before = state.timer.now();
					await runMethod();
					const after = state.timer.now();
					duration = state.timer.toSeconds(before, after);
					await afterMethod?.();
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

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainer } from "@fluidframework/container-definitions";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import { DocumentType, BenchmarkType } from "@fluid-internal/test-version-utils";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import {
	benchmark,
	BenchmarkArguments,
	benchmarkMemory,
	IMemoryTestObject,
} from "@fluid-tools/benchmark";
import { ISummarizer } from "@fluidframework/container-runtime";
import { DocumentMap } from "./DocumentMap";
import { DocumentMultipleDds } from "./DocumentMultipleDataStores";

export interface IDocumentCreatorProps {
	testName: string;
	provider: ITestObjectProvider;
	benchmarkType: BenchmarkType;
	documentType: DocumentType | string | undefined;
}

export interface IDocumentProps extends IDocumentCreatorProps {
	logger: ITelemetryLogger | undefined;
}

export interface ISummarizeResult {
	container: IContainer;
	summarizer: ISummarizer;
	summaryVersion: string;
}

export interface IDocumentLoader {
	mainContainer: IContainer | undefined;
	logger: ITelemetryLogger | undefined;
	initializeDocument(): Promise<void>;
	loadDocument(): Promise<IContainer>;
}
export interface IDocumentLoaderAndSummarizer extends IDocumentLoader {
	summarize(summaryVersion?: string): Promise<ISummarizeResult>;
}

/**
 * Creates a new {@link DocumentMap} using configuration parameters.
 * @param props - Properties for initializing the Document Creator.
 */
export function createDocument(props: IDocumentCreatorProps): IDocumentLoaderAndSummarizer {
	const logger = ChildLogger.create(getTestLogger?.(), undefined, {
		all: {
			driverType: props.provider.driver.type,
			driverEndpointName: props.provider.driver.endpointName,
			benchmarkType: props.benchmarkType,
			testDocument: props.testName,
			testDocumentType: props.documentType,
		},
	});
	const documentProps: IDocumentProps = { ...props, logger };

	switch (props.documentType) {
		case "MediumDocumentMap":
		case "LargeDocumentMap":
			return new DocumentMap(documentProps);
		case "MediumDocumentMultipleDataStores":
		case "LargeDocumentMultipleDataStores":
			return new DocumentMultipleDds(documentProps);
		default:
			throw new Error("Invalid document type");
	}
}

export interface IBenchmarkParameters {
	readonly minSampleCount?: number;
	readonly run: () => Promise<void>;
	readonly beforeIteration?: () => void;
	readonly afterIteration?: () => void;
	readonly before?: () => void;
	readonly after?: () => void;
	readonly beforeEachBatch?: () => void;
}
/**
 * In order to share the files between memory and benchmark tests, we need to create a test object that can be passed and used
 * in both tests. This function creates the test object and calls the appropriate test function.
 * @param title - The title of the test.
 * @param obj - The test object that will be persisted across runs (mainly used on Memory runs).
 * @param params - The {@link IBenchmarkParameters} parameters for the test.
 */
export function benchmarkAll<T extends IBenchmarkParameters>(title: string, obj: T) {
	const t: IMemoryTestObject = {
		title,
		...obj,
		run: obj.run.bind(obj),
		beforeIteration: obj.beforeIteration?.bind(obj),
		afterIteration: obj.afterIteration?.bind(obj),
		before: obj.before?.bind(obj),
		after: obj.after?.bind(obj),
	};
	benchmarkMemory(t);

	const t1: BenchmarkArguments = {
		title,
		...obj,
		benchmarkFnAsync: obj.run.bind(obj),
		before: obj.before?.bind(obj),
		after: obj.after?.bind(obj),
		beforeEachBatch: obj.beforeEachBatch?.bind(obj),
	};
	if (obj.minSampleCount !== undefined) {
		t1.minBatchCount = obj.minSampleCount;
	}
	benchmark(t1);
}

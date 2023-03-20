/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainer } from "@fluidframework/container-definitions";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import { DocumentType, BenchmarkType } from "@fluidframework/test-version-utils";
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
		default:
			throw new Error("Invalid document type");
	}
}

export interface IBenchmarkParameters {
	readonly run: () => Promise<void>;
	readonly beforeIteration?: () => void;
	readonly afterIteration?: () => void;
	readonly before?: () => void;
	readonly after?: () => void;
	readonly onCycle?: () => void;
}
/**
 * In order to share the files between memory and benchmark tests, we need to create a test object that can be passed and used
 * in both tests. This function creates the test object and calls the appropriate test function.
 * @param this - The context of the test object.
 * @param title - The title of the test.
 * @param obj - The test object that will be persisted across runs (mainly used on Memory runs).
 * @param params - The {@link IBenchmarkParameters} parameters for the test.
 */
export function benchmarkAll<T>(this: any, title: string, obj: T, params: IBenchmarkParameters) {
	const t: IMemoryTestObject = {
		title,
		...obj,
		run: params.run.bind(this),
		beforeIteration: params.beforeIteration?.bind(this),
		afterIteration: params.afterIteration?.bind(this),
		before: params.before?.bind(this),
		after: params.after?.bind(this),
	};
	benchmarkMemory(t);

	const t1: BenchmarkArguments = {
		title,
		...obj,
		benchmarkFnAsync: params.run.bind(this),
		before: params.before?.bind(this),
		after: params.after?.bind(this),
		onCycle: params.onCycle?.bind(this),
	};
	benchmark(t1);
}

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
import { DocumentMap } from "./DocumentMap";

export interface IDocumentCreatorProps {
	testName: string;
	provider: ITestObjectProvider;
	documentType: DocumentType;
	benchmarkType: BenchmarkType;
}

export interface IDocumentProps extends IDocumentCreatorProps {
	logger: ITelemetryLogger | undefined;
}

export interface IDocumentLoader {
	initializeDocument(): Promise<void>;
	loadDocument(): Promise<IContainer>;
}

/**
 * Creates a new {@link DocumentMap} using configuration parameters.
 * @param props - Properties for initializing the Document Creator.
 */
export function createDocument(props: IDocumentCreatorProps) {
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
	readonly obj: any;
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
 * @param isMemoryTest - Whether the test is a memory or time test.
 * @param scenario - scenario name.
 * @param run - function to run the test.
 * @param arg - class to be passed to the test when executing the functions
 * @param beforeIteration - function to be called before each iteration of the test (only for memory tests).
 * @param afterIteration - function to be called after each iteration of the test (only for memory tests).
 * @param before - function to be called before the test.
 * @param after - function to be called after the test.
 * @param onCycle - function to be called after each cycle of the test (only for time tests)
 */
export function benchmarkAll<T>(
	this: any,
	title: string,
	benchmarkType: BenchmarkType,
	params: IBenchmarkParameters,
) {
	console.log(`Running ${title} benchmarkType ${benchmarkType}...`);
	if (benchmarkType === "E2EMemory") {
		const t: IMemoryTestObject = {
			title,
			...params.obj,
			run: params.run.bind(this),
			beforeIteration: params.beforeIteration?.bind(this),
			afterIteration: params.afterIteration?.bind(this),
			before: params.before?.bind(this),
			after: params.after?.bind(this),
		};
		benchmarkMemory(t);
	} else {
		const t: BenchmarkArguments = {
			title,
			...params.obj,
			benchmarkFnAsync: params.run.bind(this),
			before: params.before?.bind(this),
			after: params.after?.bind(this),
			onCycle: params.onCycle?.bind(this),
		};
		benchmark(t);
	}
}

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

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class DocumentCreator {
	/**
	 * Creates a new DocumentCreator using configuration parameters.
	 * @param props - Properties for initializing the Document Creator.
	 */
	static create(props: IDocumentCreatorProps) {
		const logger = ChildLogger.create(getTestLogger?.(), undefined, {
			all: {
				driverType: props.provider.driver.type,
				driverEndpointName: props.provider.driver.endpointName,
				benchmarkType: props.benchmarkType,
				name: props.testName,
				type: props.documentType,
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
export function benchmarkFull<T>(
	this: any,
	benchmarkType: BenchmarkType,
	scenario: string,
	run: () => Promise<void>,
	obj: T,
	beforeIteration?: () => void,
	afterIteration?: () => void,
	before?: () => void,
	after?: () => void,
	onCycle?: () => void,
) {
	if (benchmarkType === "E2EMemory") {
		const t: IMemoryTestObject = {
			title: scenario,
			...obj,
			run: run.bind(this),
			beforeIteration: beforeIteration?.bind(this),
			afterIteration: afterIteration?.bind(this),
			before: before?.bind(this),
			after: after?.bind(this),
		};
		benchmarkMemory(t);
	} else {
		const t: BenchmarkArguments = {
			title: scenario,
			...obj,
			benchmarkFnAsync: run.bind(this),
			before: before?.bind(this),
			after: after?.bind(this),
			onCycle: onCycle?.bind(this),
		};
		benchmark(t);
	}
}

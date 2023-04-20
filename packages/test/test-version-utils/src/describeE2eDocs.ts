/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChildLogger } from "@fluidframework/telemetry-utils";
import { TestDriverTypes } from "@fluidframework/test-driver-definitions";
import {
	getUnexpectedLogErrorException,
	ITestObjectProvider,
	TestObjectProvider,
} from "@fluidframework/test-utils";
import { configList } from "./compatConfig";
import { CompatKind, baseVersion, driver, r11sEndpointName, tenantIndex } from "./compatOptions";
import { getVersionedTestObjectProvider } from "./compatUtils";
import { ITestObjectProviderOptions } from "./describeCompat";

/*
 * Types of documents to be used during the performance runs.
 */
export type DocumentType =
	/** Document with a SharedMap with a 5Mb entry */
	| "MediumDocumentMap"
	/** Document with a SharedMap with 2 x 5Mb entries */
	| "LargeDocumentMap"
	/** Medium document with Multiple DataStores (each data store has 3 DDS) */
	| "MediumDocumentMultipleDataStores"
	/** Large document with Multiple DataStores (each data store has 3 DDS) */
	| "LargeDocumentMultipleDataStores";

// Default document types to be used during the performance E2E runs.
const E2EDefaultDocumentTypes: DescribeE2EDocInfo[] = [
	{
		testTitle: "10Mb Map",
		documentType: "LargeDocumentMap",
		minSampleCount: 2,
		supportedEndpoints: ["local", "odsp"],
	},
	{
		testTitle: "5Mb Map",
		documentType: "MediumDocumentMap",
		minSampleCount: 2,
		supportedEndpoints: ["local", "odsp"],
	},
	{
		testTitle: "250 DataStores - 750 DDSs",
		documentType: "MediumDocumentMultipleDataStores",
		minSampleCount: 1,
	},
	{
		testTitle: "500 DataStores - 1500 DDSs",
		documentType: "LargeDocumentMultipleDataStores",
		minSampleCount: 1,
	},
];

export type BenchmarkType = "E2ETime" | "E2EMemory";
export type BenchmarkTypeDescription = "Runtime benchmarks" | "Memory benchmarks";

export interface DescribeE2EDocInfo {
	testTitle: string;
	documentType: DocumentType | string | undefined;
	supportedEndpoints?: TestDriverTypes[];
	/**
	 * Minimum number of iterations when running performance tests against the document.
	 */
	minSampleCount?: number;
}
export interface DescribeE2EDocInfoWithBenchmarkType extends DescribeE2EDocInfo {
	benchmarkType: BenchmarkType;
}

export type DescribeE2EDocSuite = (
	title: string,
	tests: (
		this: Mocha.Suite,
		provider: (options?: ITestObjectProviderOptions) => ITestObjectProvider,
		documentType: () => DescribeE2EDocInfo,
	) => void,
	docTypes?: DescribeE2EDocInfo[],
	testType?: string,
) => Mocha.Suite | void;

function createE2EDocsDescribe(docTypes?: DescribeE2EDocInfo[]): DescribeE2EDocSuite {
	const d: DescribeE2EDocSuite = (title, tests, testType) => {
		describe(
			`${testType} -`,
			createE2EDocCompatSuite(title, tests, docTypes ?? E2EDefaultDocumentTypes),
		);
	};
	return d;
}

function createE2EDocsDescribeWithType(testType: BenchmarkTypeDescription): DescribeE2EDocSuite {
	const d: DescribeE2EDocSuite = (title, tests, docTypes) => {
		describe(
			`${testType} -`,
			createE2EDocCompatSuite(
				title,
				tests,
				docTypes === undefined ? E2EDefaultDocumentTypes : docTypes,
			),
		);
	};
	return d;
}

function createE2EDocCompatSuite(
	title: string,
	tests: (
		this: Mocha.Suite,
		provider: () => ITestObjectProvider,
		documentType: () => DescribeE2EDocInfo,
	) => void,
	docTypes: DescribeE2EDocInfo[],
) {
	const compatFilter: CompatKind[] = [CompatKind.None];
	let configs = configList.value;
	configs = configs.filter((value) => compatFilter.includes(value.kind));

	return function (this: Mocha.Suite) {
		for (const config of configs) {
			for (const doctype of docTypes) {
				const name = `${title} - ${doctype.testTitle}`;
				describe(name, function () {
					let provider: TestObjectProvider;
					let resetAfterEach: boolean;
					before(async function () {
						try {
							provider = await getVersionedTestObjectProvider(
								baseVersion,
								config.loader,
								{
									type: driver,
									version: config.driver,
									config: {
										r11s: { r11sEndpointName },
										odsp: { tenantIndex },
									},
								},
								config.containerRuntime,
								config.dataRuntime,
							);
						} catch (error) {
							const logger = ChildLogger.create(getTestLogger?.(), "DescribeE2EDocs");
							logger.sendErrorEvent(
								{
									eventName: "TestObjectProviderLoadFailed",
									driverType: driver,
								},
								error,
							);
							throw error;
						}

						Object.defineProperty(this, "__fluidTestProvider", { get: () => provider });
					});
					tests.bind(this)(
						(options?: ITestObjectProviderOptions) => {
							resetAfterEach = options?.resetAfterEach ?? true;
							if (options?.syncSummarizer === true) {
								provider.resetLoaderContainerTracker(
									true /* syncSummarizerClients */,
								);
							}
							return provider;
						},
						() => {
							return doctype;
						},
					);

					afterEach(function (done: Mocha.Done) {
						// if the test failed for another reason
						// then we don't need to check errors
						// and fail the after each as well
						if (this.currentTest?.state === "passed") {
							const logErrors = getUnexpectedLogErrorException(provider.logger);
							done(logErrors);
						} else {
							done();
						}
						if (resetAfterEach) {
							provider.reset();
						}
					});
				});
			}
		}
	};
}

export const describeE2EDocs: DescribeE2EDocSuite = createE2EDocsDescribe(E2EDefaultDocumentTypes);

export const describeE2EDocsRuntime: DescribeE2EDocSuite =
	createE2EDocsDescribeWithType("Runtime benchmarks");

export const describeE2EDocsMemory: DescribeE2EDocSuite =
	createE2EDocsDescribeWithType("Memory benchmarks");

function isMemoryTest(): boolean {
	let isMemoryUsageTest: boolean = false;
	const childArgs = [...process.execArgv, ...process.argv.slice(1)];
	for (const flag of ["--grep", "--fgrep"]) {
		const flagIndex = childArgs.indexOf(flag);
		if (flagIndex > 0) {
			isMemoryUsageTest = childArgs[flagIndex + 1] === "@MemoryUsage" ? true : false;
			break;
		}
	}
	const isMemTest: boolean =
		process.env.FLUID_E2E_MEMORY !== undefined ? true : isMemoryUsageTest ?? false;
	console.log(`isMemTest: ${isMemTest}`);
	return isMemTest;
}

export const describeE2EDocRun: DescribeE2EDocSuite = createE2EDocsDescribeRun();
export const getCurrentBenchmarkType = (currentType: DescribeE2EDocSuite): BenchmarkType => {
	return currentType === describeE2EDocsMemory ? "E2EMemory" : "E2ETime";
};

function createE2EDocsDescribeRun(): DescribeE2EDocSuite {
	return isMemoryTest() === true ? describeE2EDocsMemory : describeE2EDocsRuntime;
}

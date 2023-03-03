/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChildLogger } from "@fluidframework/telemetry-utils";
import {
	getUnexpectedLogErrorException,
	ITestObjectProvider,
	TestObjectProvider,
} from "@fluidframework/test-utils";
import { configList } from "./compatConfig";
import { CompatKind, baseVersion, driver, r11sEndpointName, tenantIndex } from "./compatOptions";
import { getVersionedTestObjectProvider } from "./compatUtils";
import { ITestObjectProviderOptions } from "./describeCompat";

export type DocumentType =
	/** Document with a SharedMap with a 5Mb value */
	| "MediumDocumentMap"
	/** Document with a SharedMap with a 10Mb value */
	| "LargeDocumentMap";

export interface DescribeE2EDocInfo {
	testTitle: string;
	documentType: DocumentType;
}

export type DescribeE2EDocCompatSuite = (
	name: string,
	tests: (
		this: Mocha.Suite,
		provider: (options?: ITestObjectProviderOptions) => ITestObjectProvider,
		documentType: () => DescribeE2EDocInfo,
	) => void,
	docTypes: DescribeE2EDocInfo[],
) => Mocha.Suite | void;

function createE2EDocsCompatDescribe(): DescribeE2EDocCompatSuite {
	const d: DescribeE2EDocCompatSuite = (name, tests, docTypes) =>
		describe(name, createE2EDocCompatSuite(name, tests, docTypes));
	return d;
}

function createE2EDocCompatSuite(
	name: string,
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
				describe(doctype.testTitle, function () {
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
						() => doctype,
					);

					afterEach(function (done: Mocha.Done) {
						const logErrors = getUnexpectedLogErrorException(provider.logger);
						// if the test failed for another reason
						// then we don't need to check errors
						// and fail the after each as well
						if (this.currentTest?.state === "passed") {
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

export const describeE2EDocs: DescribeE2EDocCompatSuite = createE2EDocsCompatDescribe();

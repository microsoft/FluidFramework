/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainer } from "@fluidframework/container-definitions";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import { DocumentType, BenchmarkType } from "@fluidframework/test-version-utils";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { ITestObjectProvider } from "@fluidframework/test-utils";
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

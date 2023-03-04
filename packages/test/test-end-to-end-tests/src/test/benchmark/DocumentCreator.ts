/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainer } from "@fluidframework/container-definitions";
import { TestDriverTypes } from "@fluidframework/test-driver-definitions";
import { DocumentType } from "@fluidframework/test-version-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { DocumentMap } from "./DocumentMap";

export interface IDocumentProps {
	testName: string;
	provider: ITestObjectProvider;
	driverType: TestDriverTypes;
	driverEndpointName: string | undefined;
	documentType: DocumentType;
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
	static create(props: IDocumentProps) {
		switch (props.documentType) {
			case "MediumDocumentMap":
				return new DocumentMap(props, 1);
				break;
			case "LargeDocumentMap":
				return new DocumentMap(props, 2);
				break;
			default:
				throw new Error("Invalid document type");
		}
	}
}

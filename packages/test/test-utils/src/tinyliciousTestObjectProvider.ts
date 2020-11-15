/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IUrlResolver, IDocumentServiceFactory } from "@fluidframework/driver-definitions";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";

import { InsecureTokenProvider, InsecureUrlResolver } from "@fluidframework/test-runtime-utils";
import { v4 as uuid } from "uuid";
import { BaseTestObjectProvider } from "./baseTestObjectProvider";
import { fluidEntryPoint } from "./localCodeLoader";
import { OpProcessingController } from "./opProcessingController";

/**
 * Test object provider that target Tinylicious
 */
export class TinyliciousTestObjectProvider<TestContainerConfigType>
    extends BaseTestObjectProvider<TestContainerConfigType> {
    private _documentId: string | undefined;
    private _documentServiceFactory: IDocumentServiceFactory | undefined;
    private _urlResolver: IUrlResolver | undefined;
    private _opProcessingController: OpProcessingController | undefined;

    constructor(
        createFluidEntryPoint: (testContainerConfig?: TestContainerConfigType) => fluidEntryPoint,
    ) {
        super(createFluidEntryPoint);
    }

    get documentId() {
        if (this._documentId === undefined) {
            this._documentId = uuid();
        }
        return this._documentId;
    }

    get documentLoadUrl() {
        return `fluid-test://localhost/tinylicious/${this.documentId}`;
    }

    get documentServiceFactory() {
        if (!this._documentServiceFactory) {
            const tinyliciousTokenProvider = new InsecureTokenProvider(
                "tinylicious",
                this.documentId,
                "12345",
                { id: "test" });
            this._documentServiceFactory = new RouterliciousDocumentServiceFactory(tinyliciousTokenProvider);
        }
        return this._documentServiceFactory;
    }

    get urlResolver() {
        if (!this._urlResolver) {
            this._urlResolver = new InsecureUrlResolver(
                "http://localhost:3000",
                "http://localhost:3000",
                "http://localhost:3000",
                "tinylicious",
                "12345",
                true);
        }
        return this._urlResolver;
    }

    get opProcessingController() {
        if (!this._opProcessingController) {
            this._opProcessingController = new OpProcessingController();
        }
        return this._opProcessingController;
    }

    public async reset() {
        this._documentServiceFactory = undefined;
        this._opProcessingController = undefined;
        this._documentId = undefined;
    }
}

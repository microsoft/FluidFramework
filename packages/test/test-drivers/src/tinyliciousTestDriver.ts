/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@fluidframework/core-interfaces";
import {
    createTinyliciousCreateNewRequest,
    InsecureTinyliciousTokenProvider,
    InsecureTinyliciousUrlResolver,
    defaultTinyliciousPort,
} from "@fluidframework/tinylicious-driver";
import { ITestDriver } from "@fluidframework/test-driver-definitions";
import { IDocumentServiceFactory } from "@fluidframework/driver-definitions";
import { RouterliciousDriverApiType, RouterliciousDriverApi } from "./routerliciousDriverApi";

export class TinyliciousTestDriver implements ITestDriver {
    public readonly type = "tinylicious";
    public get version() { return this.api.version; }

    constructor(private readonly api: RouterliciousDriverApiType = RouterliciousDriverApi) {}
    createDocumentServiceFactory(): IDocumentServiceFactory {
        return new this.api.RouterliciousDocumentServiceFactory(
            new InsecureTinyliciousTokenProvider());
    }
    createUrlResolver(): InsecureTinyliciousUrlResolver {
        return new InsecureTinyliciousUrlResolver();
    }
    createCreateNewRequest(testId: string): IRequest {
        return createTinyliciousCreateNewRequest(testId);
    }
    async createContainerUrl(testId: string): Promise<string> {
        return `http://localhost:${defaultTinyliciousPort}/${testId}`;
    }
}

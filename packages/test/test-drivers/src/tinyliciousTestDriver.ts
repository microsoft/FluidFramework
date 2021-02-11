/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@fluidframework/core-interfaces";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import {
    createTinyliciousCreateNewRequest,
    InsecureTinyliciousTokenProvider,
    InsecureTinyliciousUrlResolver,
} from "@fluidframework/tinylicious-driver";
import { ITestDriver } from "@fluidframework/test-driver-definitions";
import { pkgVersion } from "./packageVersion";

export class TinyliciousTestDriver implements ITestDriver {
    public readonly type = "tinylicious";
    public readonly version = pkgVersion;

    createDocumentServiceFactory(): RouterliciousDocumentServiceFactory {
        return new RouterliciousDocumentServiceFactory(
            new InsecureTinyliciousTokenProvider());
    }
    createUrlResolver(): InsecureTinyliciousUrlResolver {
        return new InsecureTinyliciousUrlResolver();
    }
    createCreateNewRequest(testId: string): IRequest {
        return createTinyliciousCreateNewRequest(testId);
    }
    createContainerUrl(testId: string): string {
        return `http://localhost:3000/${testId}`;
    }
}

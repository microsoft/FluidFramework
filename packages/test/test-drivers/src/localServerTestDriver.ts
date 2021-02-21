/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IRequest } from "@fluidframework/core-interfaces";
import {
    LocalDocumentServiceFactory,
    LocalResolver,
    createLocalResolverCreateNewRequest,
} from "@fluidframework/local-driver";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { ITestDriver } from "@fluidframework/test-driver-definitions";
import { pkgVersion } from "./packageVersion";

export class LocalServerTestDriver implements ITestDriver {
    private readonly _server = LocalDeltaConnectionServer.create();

    public readonly type = "local";
    public readonly version = pkgVersion;
    public get server() {return this._server;}

    createDocumentServiceFactory(): LocalDocumentServiceFactory {
        return new LocalDocumentServiceFactory(this._server);
    }
    createUrlResolver(): LocalResolver {
        return new LocalResolver();
    }
    createCreateNewRequest(testId: string): IRequest {
        return createLocalResolverCreateNewRequest(testId);
    }

    async createContainerUrl(testId: string): Promise<string> {
        return `http://localhost/${testId}`;
    }
}

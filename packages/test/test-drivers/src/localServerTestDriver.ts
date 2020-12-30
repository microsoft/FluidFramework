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
import { ISummaryConfiguration } from "@fluidframework/protocol-definitions";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { ITestDriver } from "./interfaces";

export class LocalServerTestDriver implements ITestDriver {
    private _server = LocalDeltaConnectionServer.create();

    public readonly type = "local";
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

    createContainerUrl(testId: string): string {
        return `http://localhost/${testId}`;
    }

    /**
     * @deprecated - We only need this for some back-compat cases. Once we have a release with
     * all the test driver changes, this will be removed in 0.33
     */
    public async reset(options?: {serviceConfiguration?: {summary?: Partial<ISummaryConfiguration>}}) {
        await this._server?.webSocketServer.close();
        this._server = LocalDeltaConnectionServer.create(undefined, options?.serviceConfiguration as any);
    }
}

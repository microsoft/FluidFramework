/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import {
    IFluidResolvedUrl,
    IResolvedUrl,
    IUrlResolver,
    IExperimentalUrlResolver,
} from "@microsoft/fluid-driver-definitions";
import { ScopeType, ISummaryTree, ICommittedProposal } from "@microsoft/fluid-protocol-definitions";
import { generateToken } from "@microsoft/fluid-server-services-client";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@microsoft/fluid-server-local-server";
import { IExperimentalDocumentStorage } from "@microsoft/fluid-server-services-core";

/**
 * Resolves URLs by providing fake URLs which succeed with the other
 * related test classes.
 */
export class TestResolver implements IUrlResolver, IExperimentalUrlResolver {
    public readonly isExperimentalUrlResolver = true;
    private readonly tenantId = "tenantId";
    private readonly tokenKey = "tokenKey";

    constructor(
        private readonly testDeltaConnectionServer?: ILocalDeltaConnectionServer,
    ) {}

    /**
     * Resolves URL requests by providing fake URLs with an actually generated
     * token from constant test strings. The root of the URL is fake, but the
     * remaining relative URL can still be parsed.
     * @param request - request to handle
     */
    public async resolve(request: IRequest): Promise<IResolvedUrl> {
        const parsedUrl = new URL(request.url);
        const documentId = parsedUrl.pathname.substr(1).split("/")[0];
        return this.resolveHelper(documentId);
    }

    public async createContainer(
        summary: ISummaryTree,
        sequenceNumber: number,
        values: [string, ICommittedProposal][],
        request: IRequest,
    ): Promise<IResolvedUrl> {
        if (!this.testDeltaConnectionServer) {
            throw new Error("Provide the localDeltaConnectionServer!!");
        }
        // eslint-disable-next-line max-len
        const expDocumentStorage = ((this.testDeltaConnectionServer as LocalDeltaConnectionServer).documentStorage as IExperimentalDocumentStorage);
        if (!(expDocumentStorage && expDocumentStorage.isExperimentalDocumentStorage)) {
            throw new Error("Storage has no experimental features!!");
        }

        const parsedUrl = new URL(request.url);
        const documentId = parsedUrl.pathname.substr(1).split("/")[0];

        await expDocumentStorage.createDocument(
            this.tenantId,
            documentId,
            summary,
            sequenceNumber,
            values,
        );
        return this.resolveHelper(documentId);
    }

    private resolveHelper(documentId: string) {
        const scopes = [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite];
        const resolved: IFluidResolvedUrl = {
            endpoints: {
                deltaStorageUrl: `http://localhost:3000/deltas/${this.tenantId}/${documentId}`,
                ordererUrl: "http://localhost:3000",
                storageUrl: `http://localhost:3000/repos/${this.tenantId}`,
            },
            tokens: { jwt: generateToken(this.tenantId, documentId, this.tokenKey, scopes) },
            type: "fluid",
            url: `fluid-test://localhost:3000/${this.tenantId}/${documentId}`,
        };

        return resolved;
    }
}

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
import {
    ScopeType,
    ISummaryTree,
    ISummaryBlob,
    IDocumentAttributes,
    ICommittedProposal,
} from "@microsoft/fluid-protocol-definitions";
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
        private readonly id: string = "documentId",
        private readonly testDeltaConnectionServer?: ILocalDeltaConnectionServer,
    ) {}

    /**
     * Resolves URL requests by providing fake URLs with an actually generated
     * token from constant test strings.  The root of the URL is fake, but the
     * remaining relative URL can still be parsed.
     * @param request - request to handle; not used
     */
    public async resolve(request: IRequest): Promise<IResolvedUrl> {
        return this.resolveHelper();
    }

    public async createContainer(
        appSummary: ISummaryTree,
        protocolSummary: ISummaryTree,
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

        const quorumValuesBlob = protocolSummary.tree.quorumValues as ISummaryBlob;
        const attributesBlob = protocolSummary.tree[".attributes"] as ISummaryBlob;
        const quorumValues = JSON.parse(quorumValuesBlob.content as string) as [string, ICommittedProposal][];
        const attributes = JSON.parse(attributesBlob.content as string) as IDocumentAttributes;
        const sequenceNumber = attributes.sequenceNumber;
        await expDocumentStorage.createDocument(
            this.tenantId,
            this.id,
            appSummary,
            sequenceNumber,
            quorumValues,
        );
        return this.resolveHelper();
    }

    private resolveHelper() {
        const scopes = [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite];
        const resolved: IFluidResolvedUrl = {
            endpoints: {
                deltaStorageUrl: `http://localhost:3000/deltas/${this.tenantId}/${this.id}`,
                ordererUrl: "http://localhost:3000",
                storageUrl: `http://localhost:3000/repos/${this.tenantId}`,
            },
            tokens: { jwt: generateToken(this.tenantId, this.id, this.tokenKey, scopes) },
            type: "fluid",
            url: `fluid-test://localhost:3000/${this.tenantId}/${this.id}`,
        };

        return resolved;
    }
}

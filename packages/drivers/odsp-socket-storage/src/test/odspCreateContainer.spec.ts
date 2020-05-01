/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import {
    IExperimentalDocumentServiceFactory,
    IExperimentalDocumentService,
    IDocumentService,
} from "@microsoft/fluid-driver-definitions";
import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { DebugLogger } from "@microsoft/fluid-common-utils";
import { ISummaryTree, SummaryType } from "@microsoft/fluid-protocol-definitions";
import { OdspDriverUrlResolver } from "../odspDriverUrlResolver";
import { IFetchWrapper } from "../fetchWrapper";
import { OdspDocumentServiceFactory } from "../odspDocumentServiceFactory";
import { IOdspResolvedUrl } from "../contracts";
import { getHashedDocumentId } from "../odspUtils";

describe("Odsp Create Container Test", () => {
    const siteUrl = "https://www.localhost.xxx";
    const driveId = "driveId";
    const filePath = "path";
    const fileName = "fileName";
    let resolver: OdspDriverUrlResolver;
    let request: IRequest;

    const getOdspDocumentServiceFactory = (itemId: string) => {
        const expectedResponse: any = {
            context:"http://sp.devinstall/_api/v2.1/$metadata#",
            sequenceNumber: 1,
            sha:"shaxxshaxx",
            itemUrl:`http://fake.microsoft.com/_api/v2.1/drives/${driveId}/items/${itemId}`,
            driveId,
            itemId,
        };

        const fetchWrapperMock: IFetchWrapper = {
            get: async (url: string, _: string, headers: HeadersInit) => {
                throw new Error("not implemented");
            },
            post: async (url: string, postBody: string, headers: HeadersInit) =>
                ({
                    content: expectedResponse,
                    headers: new Map(),
                }),
        };

        const odspDocumentServiceFactory = new OdspDocumentServiceFactory(
            "dummy",
            async (url: string, refresh: boolean) => "token",
            async (refresh: boolean) => "token",
            DebugLogger.create("fluid:createContainer"),
            fetchWrapperMock);
        return odspDocumentServiceFactory as IExperimentalDocumentServiceFactory;
    };

    const createSummary = (putAppTree: boolean, putProtocolTree: boolean, sequenceNumber: number) => {
        const summary: ISummaryTree = {
            type: SummaryType.Tree,
            tree: {},
        };
        if (putAppTree) {
            summary.tree[".app"] = {
                type: SummaryType.Tree,
                tree: {},
            };
        }
        if (putProtocolTree) {
            summary.tree[".protocol"] = {
                type: SummaryType.Tree,
                tree: {
                    ".attributes": {
                        type: SummaryType.Blob,
                        content: JSON.stringify({ branch: "", minimumSequenceNumber: 0, sequenceNumber }),
                    },
                },
            };
        }
        return summary;
    };

    const createService = async (
        odspDocumentServiceFactory: IExperimentalDocumentServiceFactory,
        summary: ISummaryTree,
        resolved: IOdspResolvedUrl): Promise<IDocumentService> => {
        return odspDocumentServiceFactory.createContainer(
            summary,
            resolved,
            DebugLogger.create("fluid:createContainer"));
    };

    beforeEach(() => {
        resolver = new OdspDriverUrlResolver();
        request = resolver.createCreateNewRequest(siteUrl, driveId, filePath, fileName);
    });

    it("Check Document Service Successfully", async () => {
        const resolved = await resolver.resolve(request);
        const itemId = "fakeItemId";
        const docID = getHashedDocumentId(driveId, itemId);
        const odspDocumentServiceFactory = getOdspDocumentServiceFactory(itemId);
        const summary = createSummary(true, true, 0);
        const expDocService = (await odspDocumentServiceFactory.createContainer(
            summary,
            resolved,
            DebugLogger.create("fluid:createContainer"))) as IExperimentalDocumentService;
        assert(expDocService?.isExperimentalDocumentService, "Service should be experimental");
        const finalResolverUrl = expDocService.resolvedUrl as IOdspResolvedUrl;
        assert.strictEqual(finalResolverUrl.driveId, driveId, "Drive Id should match");
        assert.strictEqual(finalResolverUrl.itemId, itemId, "ItemId should match");
        assert.strictEqual(finalResolverUrl.siteUrl, siteUrl, "SiteUrl should match");
        assert.strictEqual(finalResolverUrl.hashedDocumentId, docID, "DocId should match");

        const url = `fluid-odsp://placeholder/placeholder/${
            docID}/?driveId=${driveId}&itemId=${itemId}&path=${encodeURIComponent("/")}`;
        const snapshotUrl = `${siteUrl}/_api/v2.1/drives/${driveId}/items/${itemId}/opStream/snapshots`;
        assert.strictEqual(finalResolverUrl.url, url, "Url should match");
        assert.strictEqual(finalResolverUrl.endpoints.snapshotStorageUrl, snapshotUrl, "Snapshot url should match");
    });

    it("No App Summary", async () => {
        const resolved = await resolver.resolve(request);
        const itemId = "fakeItemId";
        const odspDocumentServiceFactory = getOdspDocumentServiceFactory(itemId);
        const summary = createSummary(false, true, 0);
        await assert.rejects(createService(odspDocumentServiceFactory, summary, resolved),
            "Doc service should not be created because there was no app summary");
    });

    it("Wrong Seq No in Protocol Summary", async () => {
        const resolved = await resolver.resolve(request);
        const itemId = "fakeItemId";
        const odspDocumentServiceFactory = getOdspDocumentServiceFactory(itemId);
        const summary = createSummary(true, true, 1);
        await assert.rejects(createService(odspDocumentServiceFactory, summary, resolved),
            "Doc service should not be created because seq no was wrong");
    });

    it("No item id in response from server", async () => {
        const resolved = await resolver.resolve(request);
        const itemId = "";
        const odspDocumentServiceFactory = getOdspDocumentServiceFactory(itemId);
        const summary = createSummary(true, true, 0);

        await assert.rejects(createService(odspDocumentServiceFactory, summary, resolved),
            "Doc service should not be created because no Item id is there");
    });
});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { DriverErrorType, IDocumentService } from "@fluidframework/driver-definitions";
import { IRequest } from "@fluidframework/core-interfaces";
import { TelemetryUTLogger } from "@fluidframework/telemetry-utils";
import { ISummaryTree, SummaryType } from "@fluidframework/protocol-definitions";
import { fetchIncorrectResponse } from "@fluidframework/odsp-doclib-utils";
import { IOdspResolvedUrl } from "@fluidframework/odsp-driver-definitions";
import { OdspDriverUrlResolver } from "../odspDriverUrlResolver";
import { OdspDocumentServiceFactory } from "../odspDocumentServiceFactory";
import { getOdspResolvedUrl } from "../odspUtils";
import { getHashedDocumentId } from "../odspPublicUtils";
import { mockFetchOk, mockFetchMultiple, okResponse } from "./mockFetch";

describe("Odsp Create Container Test", () => {
    const siteUrl = "https://www.localhost.xxx";
    const driveId = "driveId";
    const filePath = "path";
    const fileName = "fileName";
    let resolver: OdspDriverUrlResolver;
    let request: IRequest;

    const itemId = "fakeItemId";
    const expectedResponse: any = {
        context: "http://sp.devinstall/_api/v2.1/$metadata#",
        sequenceNumber: 1,
        sha: "shaxxshaxx",
        itemUrl: `http://fake.microsoft.com/_api/v2.1/drives/${driveId}/items/${itemId}`,
        driveId,
        itemId,
    };

    const odspDocumentServiceFactory = new OdspDocumentServiceFactory(
        async (_options) => "token",
        async (_options) => "token",
    );

    const createSummary = (putAppTree: boolean, putProtocolTree: boolean) => {
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
                    attributes: {
                        type: SummaryType.Blob,
                        content: JSON.stringify({ branch: "", minimumSequenceNumber: 0, sequenceNumber: 0 }),
                    },
                },
            };
        }
        return summary;
    };

    const createService = async (
        summary: ISummaryTree,
        resolved: IOdspResolvedUrl,
    ): Promise<IDocumentService> => odspDocumentServiceFactory.createContainer(
        summary,
        resolved,
        new TelemetryUTLogger());

    beforeEach(() => {
        resolver = new OdspDriverUrlResolver();
        request = resolver.createCreateNewRequest(siteUrl, driveId, filePath, fileName);
    });

    it("Check Document Service Successfully", async () => {
        const resolved = await resolver.resolve(request);
        const docID = getHashedDocumentId(driveId, itemId);
        const summary = createSummary(true, true);
        const docService = await mockFetchOk(
            async () => odspDocumentServiceFactory.createContainer(summary, resolved, new TelemetryUTLogger()),
            expectedResponse,
        );
        const finalResolverUrl = getOdspResolvedUrl(docService.resolvedUrl);
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
        const summary = createSummary(false, true);
        await assert.rejects(createService(summary, resolved),
            "Doc service should not be created because there was no app summary");
    });

    it("No protocol Summary", async () => {
        const resolved = await resolver.resolve(request);
        const summary = createSummary(true, false);
        await assert.rejects(createService(summary, resolved),
            "Doc service should not be created because there was no protocol summary");
    });

    it("No item id in response from server", async () => {
        const resolved = await resolver.resolve(request);
        const summary = createSummary(true, true);

        try{
            await mockFetchMultiple(
                async () => createService(summary, resolved),
                [
                    // Due to retry logic in getWithRetryForTokenRefresh() for DriverErrorType.incorrectServerResponse
                    // Need to mock two calls
                    async () => okResponse({}, {}),
                    async () => okResponse({}, {}),
                ],
            );
        } catch (error) {
            assert.strictEqual(error.statusCode, fetchIncorrectResponse, "Wrong error code");
            assert.strictEqual(error.errorType, DriverErrorType.incorrectServerResponse,
                "Error type should be correct");
            assert.strictEqual(error.message, "Could not parse item from Vroom response", "Message should be correct");
        }
    });
});

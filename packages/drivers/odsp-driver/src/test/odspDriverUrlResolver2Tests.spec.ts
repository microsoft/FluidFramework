/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/dot-notation */
/* eslint-disable max-len */

import { strict as assert } from "assert";
import sinon from "sinon";
import { IRequest } from "@fluidframework/core-interfaces";
import { OdspDriverUrlResolverForShareLink } from "../odspDriverUrlResolverForShareLink";
import { SharingLinkScopeFor, SharingLinkTokenFetcher } from "../tokenFetch";
import { getHashedDocumentId } from "../odspUtils";
import { createOdspUrl } from "../createOdspUrl";
import * as graphImport from "../graph";
import { getLocatorFromOdspUrl, storeLocatorInOdspUrl } from "../odspFluidFileLink";
import { IOdspResolvedUrl, SharingLinkHeader } from "../contracts";

describe("Tests for OdspDriverUrlResolverForShareLink resolver", () => {
    const siteUrl = "https://microsoft.sharepoint-df.com/siteUrl";
    const driveId = "driveId";
    const itemId = "fileId";
    const dataStorePath = "dataStorePath";
    const fileName = "fileName";
    const sharelink = "https://microsoft.sharepoint-df.com/site/SHARELINK";
    // Base64 encoded and then URI encoded string: d=driveId&f=fileId&c=dataStorePath&s=siteUrl&fluid=1
    const urlWithNavParam = "https://microsoft.sharepoint-df.com/test?nav=cz0lMkZzaXRlVXJsJmQ9ZHJpdmVJZCZmPWZpbGVJZCZjPWRhdGFTdG9yZVBhdGgmZmx1aWQ9MQ%3D%3D";
    let urlResolver: OdspDriverUrlResolverForShareLink;

    beforeEach(() => {
        const shareLinkTokenFetcher: SharingLinkTokenFetcher =
            async (siteURL: string, scopeFor: SharingLinkScopeFor, refresh: boolean) => "SharingLinkToken";
        urlResolver = new OdspDriverUrlResolverForShareLink(shareLinkTokenFetcher);
    });

    async function mockFetch<T>(response: Promise<string>, callback: () => Promise<T>): Promise<T> {
        const getShareLinkStub = sinon.stub(graphImport, "getShareLink");
        getShareLinkStub.returns(response);
        try {
            return await callback();
        } finally {
            getShareLinkStub.restore();
        }
    }

    it("resolve - Should resolve nav link correctly", async () => {
        const resolvedUrl = await urlResolver.resolve({ url: urlWithNavParam });
        assert.strictEqual(resolvedUrl.driveId, driveId, "Drive id should be equal");
        assert.strictEqual(resolvedUrl.siteUrl, siteUrl, "SiteUrl should be equal");
        assert.strictEqual(resolvedUrl.itemId, itemId, "Item id should be absent");
        assert.strictEqual(resolvedUrl.hashedDocumentId, getHashedDocumentId(driveId, itemId), "Doc id should be equal");
        assert(resolvedUrl.endpoints.snapshotStorageUrl !== undefined, "Snapshot url should not be empty");
    });

    it("resolve - Should resolve odsp driver url correctly", async () => {
        const resolvedUrl1 = await urlResolver.resolve({ url: urlWithNavParam });
        const url: string = createOdspUrl(resolvedUrl1.siteUrl, resolvedUrl1.driveId, resolvedUrl1.itemId, dataStorePath);
        const resolvedUrl2 = await urlResolver.resolve({ url });
        assert.strictEqual(resolvedUrl2.driveId, driveId, "Drive id should be equal");
        assert.strictEqual(resolvedUrl2.siteUrl, siteUrl, "SiteUrl should be equal");
        assert.strictEqual(resolvedUrl2.itemId, itemId, "Item id should be absent");
        assert.strictEqual(resolvedUrl2.hashedDocumentId, getHashedDocumentId(driveId, itemId), "Doc id should be equal");
        assert(resolvedUrl2.endpoints.snapshotStorageUrl !== undefined, "Snapshot url should not be empty");
    });

    it("resolve - Check conversion in either direction", async () => {
        const resolvedUrl = await mockFetch(Promise.resolve(sharelink), async () => {
            return urlResolver.resolve({ url: urlWithNavParam });
        });
        const absoluteUrl = await urlResolver.getAbsoluteUrl(resolvedUrl, dataStorePath);
        const actualNavParam = new URLSearchParams(absoluteUrl).get("nav");
        const expectedNavParam = new URLSearchParams(sharelink).get("nav");
        assert(actualNavParam !== undefined, "Nav param should be defined!!");
        assert.strictEqual(expectedNavParam, actualNavParam, "Nav param should match");
    });

    it("resolve - Should generate sharelink and set it in shareLinkMap", async () => {
        const url: string = createOdspUrl(siteUrl, driveId, itemId, dataStorePath);
        await mockFetch(Promise.resolve(sharelink), async () => {
            return urlResolver.resolve({ url });
        });
        const actualShareLink = await urlResolver["sharingLinkCache"].get(`${siteUrl},${driveId},${itemId}`);
        return assert.strictEqual(actualShareLink, sharelink, "Sharing link should be equal!!");
    });

    it("getAbsoluteUrl - Should generate sharelink if none was generated on resolve", async () => {
        const mockResolvedUrl = ({ siteUrl, driveId, itemId } as any) as IOdspResolvedUrl;
        const absoluteUrl = await mockFetch(Promise.resolve(sharelink), async () => {
            return urlResolver.getAbsoluteUrl(mockResolvedUrl, dataStorePath);
        });

        assert(absoluteUrl !== undefined, "Absolute url should be defined!!");
        const actualShareLink = await urlResolver["sharingLinkCache"].get(`${siteUrl},${driveId},${itemId}`);
        assert.strictEqual(actualShareLink, sharelink, "Sharing link should be equal!!");

        const url = new URL(sharelink);
        storeLocatorInOdspUrl(url, { siteUrl, driveId, fileId: itemId, dataStorePath });
        assert.strictEqual(absoluteUrl, url.toString(), "Absolute url should be equal!!");
    });

    it("getAbsoluteUrl - Should throw if getShareLink throws and clear the promise from shareLinkMap", async () => {
        const mockResolvedUrl = ({ siteUrl, driveId, itemId } as any) as IOdspResolvedUrl;
        let success = true;
        const absoluteUrl = await mockFetch(Promise.reject(new Error("No Sharelink")), async () => {
            return urlResolver.getAbsoluteUrl(mockResolvedUrl, dataStorePath);
        }).catch((error) => {
            assert.strictEqual(error.message, "No Sharelink", "Error should be as expected.");
            success = false;
        });

        assert(absoluteUrl === undefined, "Absolute url should be undefined!!");
        const actualShareLink = await urlResolver["sharingLinkCache"].get(`${siteUrl},${driveId},${itemId}`);
        assert(actualShareLink === undefined, "Sharing link should be undefined!!");
        assert.strictEqual(success, false, "Error should be as expected!!");
    });

    it("Should resolve createNew request", async () => {
        const request: IRequest = urlResolver.createCreateNewRequest(siteUrl, driveId, dataStorePath, fileName);
        const resolvedUrl = await urlResolver.resolve(request);
        assert.strictEqual(resolvedUrl.fileName, fileName, "FileName should be equal");
        assert.strictEqual(resolvedUrl.driveId, driveId, "Drive id should be equal");
        assert.strictEqual(resolvedUrl.siteUrl, siteUrl, "SiteUrl should be equal");
        assert.strictEqual(resolvedUrl.itemId, "", "Item id should be absent");
        assert.strictEqual(resolvedUrl.hashedDocumentId, "", "No doc id should be present");
        assert.strictEqual(resolvedUrl.endpoints.snapshotStorageUrl, "", "Snapshot url should be empty");

        const [, queryString] = request.url.split("?");
        const searchParams = new URLSearchParams(queryString);
        assert.strictEqual(searchParams.get("path"), dataStorePath, "dataStorePath should match");
        assert.strictEqual(searchParams.get("driveId"), driveId, "Drive id should match");
    });

    it("Sharing link should be set when isSharingLinkToRedeem header is set", async () => {
        const resolvedUrl = await mockFetch(Promise.resolve(sharelink), async () => {
            const url = new URL(sharelink);
            storeLocatorInOdspUrl(url, { siteUrl, driveId, fileId: itemId, dataStorePath });
            return urlResolver.resolve({ url: url.toString(), headers: { [SharingLinkHeader.isSharingLinkToRedeem]: true } });
        });
        assert.strictEqual(resolvedUrl.sharingLinkToRedeem, sharelink, "Sharing link should be set in resolved url");
    });

    it("Encode and decode nav param", async () => {
        const encodedUrl = new URL(sharelink);
        storeLocatorInOdspUrl(encodedUrl, { siteUrl, driveId, fileId: itemId, dataStorePath });

        const locator = getLocatorFromOdspUrl(encodedUrl);
        assert.strictEqual(locator?.driveId, driveId, "Drive id should be equal");
        assert.strictEqual(locator?.fileId, itemId, "Item id should be equal");
        assert.strictEqual(locator?.dataStorePath, dataStorePath, "DataStore path should be equal");
        assert.strictEqual(locator?.siteUrl, siteUrl, "SiteUrl should be equal");
    });
});

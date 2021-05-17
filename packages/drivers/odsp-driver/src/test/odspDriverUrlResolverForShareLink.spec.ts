/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/dot-notation */
/* eslint-disable max-len */

import { strict as assert } from "assert";
import sinon from "sinon";
import { IRequest } from "@fluidframework/core-interfaces";
import { IOdspResolvedUrl } from "@fluidframework/odsp-driver-definitions";
import { OdspDriverUrlResolverForShareLink } from "../odspDriverUrlResolverForShareLink";
import { getHashedDocumentId } from "../odspPublicUtils";
import { createOdspUrl } from "../createOdspUrl";
import * as fileLinkImport from "../getFileLink";
import { getLocatorFromOdspUrl, storeLocatorInOdspUrl } from "../odspFluidFileLink";
import { SharingLinkHeader } from "../contractsPublic";
import { createOdspCreateContainerRequest } from "../createOdspCreateContainerRequest";

describe("Tests for OdspDriverUrlResolverForShareLink resolver", () => {
    const siteUrl = "https://microsoft.sharepoint-df.com/siteUrl";
    const driveId = "driveId";
    const itemId = "fileId";
    const dataStorePath = "dataStorePath";
    const fileName = "fileName";
    const fileVersion = "173.0";
    const sharelink = "https://microsoft.sharepoint-df.com/site/SHARELINK";
    const urlsWithNavParams = [
        // Base64 encoded and then URI encoded string: d=driveId&f=fileId&c=dataStorePath&s=siteUrl&fluid=1&v=173.0
        {hasVersion: true, url:"https://microsoft.sharepoint-df.com/test?nav=ZD1kcml2ZUlkJmY9ZmlsZUlkJmM9ZGF0YVN0b3JlUGF0aCZzPXNpdGVVcmwmZmx1aWQ9MSZ2PTE3My4w"},
        // Base64 encoded and then URI encoded string: d=driveId&f=fileId&c=dataStorePath&s=siteUrl&fluid=1
        {hasVersion: false, url:"https://microsoft.sharepoint-df.com/test?nav=cz0lMkZzaXRlVXJsJmQ9ZHJpdmVJZCZmPWZpbGVJZCZjPWRhdGFTdG9yZVBhdGgmZmx1aWQ9MQ%3D%3D"},
    ];
    let urlResolverWithShareLinkFetcher: OdspDriverUrlResolverForShareLink;
    let urlResolverWithoutShareLinkFetcher: OdspDriverUrlResolverForShareLink;
    const mockResolvedUrl = ({ siteUrl, driveId, itemId, odspResolvedUrl: true } as any) as IOdspResolvedUrl;

    beforeEach(() => {
        urlResolverWithShareLinkFetcher = new OdspDriverUrlResolverForShareLink(
            { tokenFetcher: async () => "SharingLinkToken", identityType: "Enterprise" });
        urlResolverWithoutShareLinkFetcher = new OdspDriverUrlResolverForShareLink();
    });

    async function mockGetFileLink<T>(response: Promise<string>, callback: () => Promise<T>): Promise<T> {
        const getFileLinkStub = sinon.stub(fileLinkImport, "getFileLink");
        getFileLinkStub.returns(response);
        try {
            return await callback();
        } finally {
            getFileLinkStub.restore();
        }
    }
    for(const urlWithNav of urlsWithNavParams) {
        it(`resolve - Should resolve nav link correctly hasVersion: ${urlWithNav.hasVersion}`, async () => {
            const runTest = async (resolver: OdspDriverUrlResolverForShareLink) => {
                const resolvedUrl = await resolver.resolve({ url: urlWithNav.url });
                assert.strictEqual(resolvedUrl.driveId, driveId, "Drive id should be equal");
                assert.strictEqual(resolvedUrl.siteUrl, siteUrl, "SiteUrl should be equal");
                assert.strictEqual(resolvedUrl.itemId, itemId, "Item id should be equal");
                assert.strictEqual(resolvedUrl.fileVersion, urlWithNav.hasVersion ? fileVersion : undefined);
                assert.strictEqual(resolvedUrl.hashedDocumentId, getHashedDocumentId(driveId, itemId), "Doc id should be equal");
                assert(resolvedUrl.endpoints.snapshotStorageUrl !== undefined, "Snapshot url should not be empty");
            };
            await runTest(urlResolverWithShareLinkFetcher);
            await runTest(urlResolverWithoutShareLinkFetcher);
        });

        it(`resolve - Should resolve odsp driver url correctly hasVersion: ${urlWithNav.hasVersion}`, async () => {
            const runTest = async (resolver: OdspDriverUrlResolverForShareLink) => {
                const resolvedUrl1 = await resolver.resolve({ url: urlWithNav.url });
                const url: string = createOdspUrl({... resolvedUrl1, dataStorePath});
                const resolvedUrl2 = await resolver.resolve({ url });
                assert.strictEqual(resolvedUrl2.driveId, driveId, "Drive id should be equal");
                assert.strictEqual(resolvedUrl2.siteUrl, siteUrl, "SiteUrl should be equal");
                assert.strictEqual(resolvedUrl2.itemId, itemId, "Item id should be equal");
                assert.strictEqual(resolvedUrl2.fileVersion, urlWithNav.hasVersion  ? fileVersion : undefined);
                assert.strictEqual(resolvedUrl2.hashedDocumentId, getHashedDocumentId(driveId, itemId), "Doc id should be equal");
                assert(resolvedUrl2.endpoints.snapshotStorageUrl !== undefined, "Snapshot url should not be empty");
            };
            await runTest(urlResolverWithShareLinkFetcher);
            await runTest(urlResolverWithoutShareLinkFetcher);
        });

        it(`resolve - Check conversion in either direction hasVersion: ${urlWithNav.hasVersion}`, async () => {
            const resolvedUrl = await mockGetFileLink(Promise.resolve(sharelink), async () => {
                return urlResolverWithShareLinkFetcher.resolve({ url: urlWithNav.url });
            });
            const absoluteUrl = await urlResolverWithShareLinkFetcher.getAbsoluteUrl(resolvedUrl, dataStorePath);
            const actualNavParam = new URLSearchParams(absoluteUrl).get("nav");
            const expectedNavParam = new URLSearchParams(sharelink).get("nav");
            assert(actualNavParam !== undefined, "Nav param should be defined!!");
            assert.strictEqual(expectedNavParam, actualNavParam, "Nav param should match");
        });
    }

    it("resolve - Should generate sharelink and set it in shareLinkMap if using resolver with TokenFetcher", async () => {
        const url: string = createOdspUrl({siteUrl, driveId, itemId, dataStorePath});
        await mockGetFileLink(Promise.resolve(sharelink), async () => {
            return urlResolverWithShareLinkFetcher.resolve({ url });
        });
        const actualShareLink = await urlResolverWithShareLinkFetcher["sharingLinkCache"].get(`${siteUrl},${driveId},${itemId}`);
        return assert.strictEqual(actualShareLink, sharelink, "Sharing link should be equal!!");
    });

    it("resolve - Should not generate sharelink if using resolver without TokenFetcher", async () => {
        const url: string = createOdspUrl({siteUrl, driveId, itemId, dataStorePath});
        await mockGetFileLink(Promise.resolve(sharelink), async () => {
            return urlResolverWithoutShareLinkFetcher.resolve({ url });
        });
        const actualShareLink = await urlResolverWithoutShareLinkFetcher["sharingLinkCache"].get(`${siteUrl},${driveId},${itemId}`);
        return assert.strictEqual(actualShareLink, undefined, "Sharing link should be undefined");
    });

    it("getAbsoluteUrl - Should generate sharelink if none was generated on resolve", async () => {
        const absoluteUrl = await mockGetFileLink(Promise.resolve(sharelink), async () => {
            return urlResolverWithShareLinkFetcher.getAbsoluteUrl(mockResolvedUrl, dataStorePath);
        });

        assert(absoluteUrl !== undefined, "Absolute url should be defined!!");
        const actualShareLink = await urlResolverWithShareLinkFetcher["sharingLinkCache"].get(`${siteUrl},${driveId},${itemId}`);
        assert.strictEqual(actualShareLink, sharelink, "Sharing link should be equal!!");

        const url = new URL(sharelink);
        storeLocatorInOdspUrl(url, { siteUrl, driveId, itemId, dataStorePath });
        assert.strictEqual(absoluteUrl, url.toString(), "Absolute url should be equal!!");
    });

    it("getAbsoluteUrl - Should throw if getShareLink throws and clear the promise from shareLinkMap", async () => {
        let success = true;
        const absoluteUrl = await mockGetFileLink(Promise.reject(new Error("No Sharelink")), async () => {
            return urlResolverWithShareLinkFetcher.getAbsoluteUrl(mockResolvedUrl, dataStorePath);
        }).catch((error) => {
            assert.strictEqual(error.message, "No Sharelink", "Error should be as expected.");
            success = false;
        });

        assert(absoluteUrl === undefined, "Absolute url should be undefined!!");
        const actualShareLink = await urlResolverWithShareLinkFetcher["sharingLinkCache"].get(`${siteUrl},${driveId},${itemId}`);
        assert(actualShareLink === undefined, "Sharing link should be undefined!!");
        assert.strictEqual(success, false, "Error should be as expected!!");
    });

    it("getAbsoluteUrl - Should throw if using resolver without TokenFetcher", async () => {
        let success = true;
        const absoluteUrl = await mockGetFileLink(Promise.resolve(sharelink), async () => {
            return urlResolverWithoutShareLinkFetcher.getAbsoluteUrl(mockResolvedUrl, dataStorePath);
        }).catch(() => {
            success = false;
        });

        assert(absoluteUrl === undefined, "Absolute url should be undefined!!");
        const actualShareLink = await urlResolverWithShareLinkFetcher["sharingLinkCache"].get(`${siteUrl},${driveId},${itemId}`);
        assert(actualShareLink === undefined, "Sharing link should be undefined!!");
        assert.strictEqual(success, false, "Error should be thrown!!");
    });

    it("Should resolve createNew request", async () => {
        const runTest = async (resolver: OdspDriverUrlResolverForShareLink) => {
            const request: IRequest = createOdspCreateContainerRequest(siteUrl, driveId, dataStorePath, fileName);
            const resolvedUrl = await resolver.resolve(request);
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
        };
        await runTest(urlResolverWithShareLinkFetcher);
        await runTest(urlResolverWithoutShareLinkFetcher);
    });

    it("Sharing link should be set when isSharingLinkToRedeem header is set", async () => {
        const url = new URL(sharelink);
        const resolvedUrl = await mockGetFileLink(Promise.resolve(sharelink), async () => {
            storeLocatorInOdspUrl(url, { siteUrl, driveId, itemId, dataStorePath });
            return urlResolverWithShareLinkFetcher.resolve(
                { url: url.toString(), headers: { [SharingLinkHeader.isSharingLinkToRedeem]: true } });
        });
        assert.strictEqual(resolvedUrl.sharingLinkToRedeem, url.toString(), "Sharing link should be set in resolved url");
    });

    it("Encode and decode nav param", async () => {
        const encodedUrl = new URL(sharelink);
        storeLocatorInOdspUrl(encodedUrl, { siteUrl, driveId, itemId, dataStorePath });

        const locator = getLocatorFromOdspUrl(encodedUrl);
        assert.strictEqual(locator?.driveId, driveId, "Drive id should be equal");
        assert.strictEqual(locator?.itemId, itemId, "Item id should be equal");
        assert.strictEqual(locator?.dataStorePath, dataStorePath, "DataStore path should be equal");
        assert.strictEqual(locator?.siteUrl, siteUrl, "SiteUrl should be equal");
    });
});

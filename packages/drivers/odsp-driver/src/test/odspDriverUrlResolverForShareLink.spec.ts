/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/dot-notation */

import { strict as assert } from "node:assert";
import { stub } from "sinon";
import { IRequest } from "@fluidframework/core-interfaces";
import { IOdspResolvedUrl } from "@fluidframework/odsp-driver-definitions";
import { OdspDriverUrlResolverForShareLink } from "../odspDriverUrlResolverForShareLink.js";
import { getHashedDocumentId } from "../odspPublicUtils.js";
import { createOdspUrl } from "../createOdspUrl.js";
import * as fileLinkImport from "../getFileLink.js";
import {
	getLocatorFromOdspUrl,
	locatorQueryParamName,
	storeLocatorInOdspUrl,
} from "../odspFluidFileLink.js";
import { SharingLinkHeader } from "../contractsPublic.js";
import { createOdspCreateContainerRequest } from "../createOdspCreateContainerRequest.js";

describe("Tests for OdspDriverUrlResolverForShareLink resolver", () => {
	const siteUrl = "https://microsoft.sharepoint-df.com/siteUrl";
	const driveId = "driveId";
	const itemId = "fileId";
	const dataStorePath = "dataStorePath";
	const fileName = "fileName";
	const fileVersion = "173.0";
	const contextObject = { w: "id1", i: "id2" };
	const contextStringified = JSON.stringify(contextObject);
	const sharelink = "https://microsoft.sharepoint-df.com/site/SHARELINK";
	const urlsWithNavParams = [
		// Base64 encoded and then URI encoded string: d=driveId&f=fileId&c=dataStorePath&s=siteUrl&fluid=1&v=173.0
		{
			hasVersion: true,
			hasContext: false,
			url: "https://microsoft.sharepoint-df.com/test?nav=ZD1kcml2ZUlkJmY9ZmlsZUlkJmM9ZGF0YVN0b3JlUGF0aCZzPXNpdGVVcmwmZmx1aWQ9MSZ2PTE3My4w",
		},
		// Base64 encoded and then URI encoded string: d=driveId&f=fileId&c=dataStorePath&s=siteUrl&fluid=1
		{
			hasVersion: false,
			hasContext: false,
			url: "https://microsoft.sharepoint-df.com/test?nav=cz0lMkZzaXRlVXJsJmQ9ZHJpdmVJZCZmPWZpbGVJZCZjPWRhdGFTdG9yZVBhdGgmZmx1aWQ9MQ%3D%3D",
		},
		// Base64 encoded and then URI encoded string: d=driveId&f=fileId&c=dataStorePath&s=siteUrl&fluid=1&v=173.0&c=%7B%22w%22%3A%22id1%22%2C%22i%22%3A%22id2%22%7D
		{
			hasVersion: true,
			hasContext: true,
			url: "https://microsoft.sharepoint-df.com/test?nav=ZD1kcml2ZUlkJmY9ZmlsZUlkJmM9ZGF0YVN0b3JlUGF0aCZzPXNpdGVVcmwmZmx1aWQ9MSZ2PTE3My4wJmM9JTdCJTIydyUyMiUzQSUyMmlkMSUyMiUyQyUyMmklMjIlM0ElMjJpZDIlMjIlN0Q%3D",
		},
		// Base64 encoded and then URI encoded string: d=driveId&f=fileId&c=dataStorePath&s=siteUrl&fluid=1&c=%7B%22w%22%3A%22id1%22%2C%22i%22%3A%22id2%22%7D
		{
			hasVersion: false,
			hasContext: true,
			url: "https://microsoft.sharepoint-df.com/test?nav=ZD1kcml2ZUlkJmY9ZmlsZUlkJmM9ZGF0YVN0b3JlUGF0aCZzPXNpdGVVcmwmZmx1aWQ9MSZjPSU3QiUyMnclMjIlM0ElMjJpZDElMjIlMkMlMjJpJTIyJTNBJTIyaWQyJTIyJTdE",
		},
	];
	let urlResolverWithShareLinkFetcher: OdspDriverUrlResolverForShareLink;
	let urlResolverWithoutShareLinkFetcher: OdspDriverUrlResolverForShareLink;
	const mockResolvedUrl = {
		siteUrl,
		driveId,
		itemId,
		odspResolvedUrl: true,
	} as unknown as IOdspResolvedUrl;

	beforeEach(() => {
		urlResolverWithShareLinkFetcher = new OdspDriverUrlResolverForShareLink({
			tokenFetcher: async (): Promise<string> => "SharingLinkToken",
			identityType: "Enterprise",
		});
		urlResolverWithoutShareLinkFetcher = new OdspDriverUrlResolverForShareLink();
	});

	async function mockGetFileLink<T>(
		response: Promise<string>,
		callback: () => Promise<T>,
	): Promise<T> {
		const getFileLinkStub = stub(fileLinkImport, "getFileLink");
		getFileLinkStub.returns(response);
		try {
			return await callback();
		} finally {
			getFileLinkStub.restore();
		}
	}
	for (const urlWithNav of urlsWithNavParams) {
		it(`resolve - Should resolve nav link correctly, hasVersion: ${urlWithNav.hasVersion}, hasContext: ${urlWithNav.hasContext}`, async () => {
			const runTest = async (resolver: OdspDriverUrlResolverForShareLink): Promise<void> => {
				const resolvedUrl = await resolver.resolve({ url: urlWithNav.url });
				assert.strictEqual(resolvedUrl.driveId, driveId, "Drive id should be equal");
				assert.strictEqual(resolvedUrl.siteUrl, siteUrl, "SiteUrl should be equal");
				assert.strictEqual(resolvedUrl.itemId, itemId, "Item id should be equal");
				assert.strictEqual(
					resolvedUrl.fileVersion,
					urlWithNav.hasVersion ? fileVersion : undefined,
				);
				assert.strictEqual(
					resolvedUrl.hashedDocumentId,
					await getHashedDocumentId(driveId, itemId),
					"Doc id should be equal",
				);
				assert(
					resolvedUrl.endpoints.snapshotStorageUrl !== undefined,
					"Snapshot url should not be empty",
				);
			};
			await runTest(urlResolverWithShareLinkFetcher);
			await runTest(urlResolverWithoutShareLinkFetcher);
		});

		it(`resolve - Should resolve odsp driver url correctly, hasVersion: ${urlWithNav.hasVersion}, hasContext: ${urlWithNav.hasContext}`, async () => {
			const runTest = async (resolver: OdspDriverUrlResolverForShareLink): Promise<void> => {
				const resolvedUrl1 = await resolver.resolve({ url: urlWithNav.url });
				const url: string = createOdspUrl({ ...resolvedUrl1, dataStorePath });
				const resolvedUrl2 = await resolver.resolve({ url });
				assert.strictEqual(resolvedUrl2.driveId, driveId, "Drive id should be equal");
				assert.strictEqual(resolvedUrl2.siteUrl, siteUrl, "SiteUrl should be equal");
				assert.strictEqual(resolvedUrl2.itemId, itemId, "Item id should be equal");
				assert.strictEqual(
					resolvedUrl2.fileVersion,
					urlWithNav.hasVersion ? fileVersion : undefined,
				);
				assert.strictEqual(
					resolvedUrl2.hashedDocumentId,
					await getHashedDocumentId(driveId, itemId),
					"Doc id should be equal",
				);
				assert(
					resolvedUrl2.endpoints.snapshotStorageUrl !== undefined,
					"Snapshot url should not be empty",
				);
			};
			await runTest(urlResolverWithShareLinkFetcher);
			await runTest(urlResolverWithoutShareLinkFetcher);
		});

		it(`resolve - Check conversion in either direction, hasVersion: ${urlWithNav.hasVersion}, hasContext: ${urlWithNav.hasContext}`, async () => {
			const resolvedUrl = await mockGetFileLink(Promise.resolve(sharelink), async () => {
				return urlResolverWithShareLinkFetcher.resolve({ url: urlWithNav.url });
			});
			const absoluteUrl = await urlResolverWithShareLinkFetcher.getAbsoluteUrl(
				resolvedUrl,
				dataStorePath,
			);
			const actualNavParam = new URLSearchParams(absoluteUrl).get("nav");
			const expectedNavParam = new URLSearchParams(sharelink).get("nav");
			assert(actualNavParam !== undefined, "Nav param should be defined!!");
			assert.strictEqual(expectedNavParam, actualNavParam, "Nav param should match");
		});

		it(`getAbsoluteUrl - Should resolve and then getAbsoluteUrl should pick dataStorePath from resolvedUrl, hasVersion: ${urlWithNav.hasVersion}, hasContext: ${urlWithNav.hasContext}`, async () => {
			const resolvedUrl1 = await mockGetFileLink(Promise.resolve(sharelink), async () => {
				return urlResolverWithShareLinkFetcher.resolve({ url: urlWithNav.url });
			});
			const absoluteUrl = await urlResolverWithShareLinkFetcher.getAbsoluteUrl(
				resolvedUrl1,
				"",
			);
			const actualNavParam = new URLSearchParams(absoluteUrl).get("nav");
			const expectedNavParam = new URLSearchParams(sharelink).get("nav");
			assert(actualNavParam !== undefined, "Nav param should be defined!!");
			assert.strictEqual(expectedNavParam, actualNavParam, "Nav param should match");

			// Then resolve again.
			const resolvedUrl2 = await mockGetFileLink(Promise.resolve(sharelink), async () => {
				return urlResolverWithShareLinkFetcher.resolve({ url: absoluteUrl });
			});
			assert.strictEqual(
				resolvedUrl2.dataStorePath,
				dataStorePath,
				"dataStorePath should be preserved",
			);
			assert.strictEqual(resolvedUrl2.driveId, driveId, "Drive id should be equal");
			assert.strictEqual(resolvedUrl2.siteUrl, siteUrl, "SiteUrl should be equal");
			assert.strictEqual(resolvedUrl2.itemId, itemId, "Item id should be equal");
			assert.strictEqual(
				resolvedUrl2.fileVersion,
				urlWithNav.hasVersion ? fileVersion : undefined,
			);
			assert.strictEqual(
				resolvedUrl2.hashedDocumentId,
				await getHashedDocumentId(driveId, itemId),
				"Doc id should be equal",
			);
			assert(
				resolvedUrl2.endpoints.snapshotStorageUrl !== undefined,
				"Snapshot url should not be empty",
			);
		});
	}

	it("resolve - Should generate sharelink and set it in shareLinkMap if using resolver with TokenFetcher", async () => {
		const url: string = createOdspUrl({ siteUrl, driveId, itemId, dataStorePath });
		await mockGetFileLink(Promise.resolve(sharelink), async () => {
			return urlResolverWithShareLinkFetcher.resolve({ url });
		});
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
		const actualShareLink = await urlResolverWithShareLinkFetcher["sharingLinkCache"].get(
			`${siteUrl},${driveId},${itemId}`,
		);
		return assert.strictEqual(actualShareLink, sharelink, "Sharing link should be equal!!");
	});

	it("resolve - Should not generate sharelink if using resolver without TokenFetcher", async () => {
		const url: string = createOdspUrl({ siteUrl, driveId, itemId, dataStorePath });
		await mockGetFileLink(Promise.resolve(sharelink), async () => {
			return urlResolverWithoutShareLinkFetcher.resolve({ url });
		});
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
		const actualShareLink = await urlResolverWithoutShareLinkFetcher["sharingLinkCache"].get(
			`${siteUrl},${driveId},${itemId}`,
		);
		return assert.strictEqual(actualShareLink, undefined, "Sharing link should be undefined");
	});

	it("getAbsoluteUrl - Should generate sharelink if none was generated on resolve", async () => {
		const absoluteUrl = await mockGetFileLink(Promise.resolve(sharelink), async () => {
			return urlResolverWithShareLinkFetcher.getAbsoluteUrl(mockResolvedUrl, dataStorePath);
		});

		assert(absoluteUrl !== undefined, "Absolute url should be defined!!");
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
		const actualShareLink = await urlResolverWithShareLinkFetcher["sharingLinkCache"].get(
			`${siteUrl},${driveId},${itemId}`,
		);
		assert.strictEqual(actualShareLink, sharelink, "Sharing link should be equal!!");

		const url = new URL(sharelink);
		storeLocatorInOdspUrl(url, { siteUrl, driveId, itemId, dataStorePath });
		assert.strictEqual(absoluteUrl, url.toString(), "Absolute url should be equal!!");
	});

	it("getAbsoluteUrl - Should throw if getShareLink throws and clear the promise from shareLinkMap", async () => {
		let success = true;
		const absoluteUrl = await mockGetFileLink(
			Promise.reject(new Error("No Sharelink")),
			async () => {
				return urlResolverWithShareLinkFetcher.getAbsoluteUrl(
					mockResolvedUrl,
					dataStorePath,
				);
			},
		).catch((error) => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			assert.strictEqual(error.message, "No Sharelink", "Error should be as expected.");
			success = false;
		});

		assert(absoluteUrl === undefined, "Absolute url should be undefined!!");
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
		const actualShareLink = await urlResolverWithShareLinkFetcher["sharingLinkCache"].get(
			`${siteUrl},${driveId},${itemId}`,
		);
		assert(actualShareLink === undefined, "Sharing link should be undefined!!");
		assert.strictEqual(success, false, "Error should be as expected!!");
	});

	it("getAbsoluteUrl - Should throw if using resolver without TokenFetcher", async () => {
		let success = true;
		const absoluteUrl = await mockGetFileLink(Promise.resolve(sharelink), async () => {
			return urlResolverWithoutShareLinkFetcher.getAbsoluteUrl(
				mockResolvedUrl,
				dataStorePath,
			);
		}).catch(() => {
			success = false;
		});

		assert(absoluteUrl === undefined, "Absolute url should be undefined!!");
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
		const actualShareLink = await urlResolverWithShareLinkFetcher["sharingLinkCache"].get(
			`${siteUrl},${driveId},${itemId}`,
		);
		assert(actualShareLink === undefined, "Sharing link should be undefined!!");
		assert.strictEqual(success, false, "Error should be thrown!!");
	});

	it("Should resolve createNew request", async () => {
		const runTest = async (resolver: OdspDriverUrlResolverForShareLink): Promise<void> => {
			const request: IRequest = createOdspCreateContainerRequest(
				siteUrl,
				driveId,
				dataStorePath,
				fileName,
			);
			const resolvedUrl = await resolver.resolve(request);
			assert.strictEqual(resolvedUrl.fileName, fileName, "FileName should be equal");
			assert.strictEqual(resolvedUrl.driveId, driveId, "Drive id should be equal");
			assert.strictEqual(resolvedUrl.siteUrl, siteUrl, "SiteUrl should be equal");
			assert.strictEqual(resolvedUrl.itemId, "", "Item id should be absent");
			assert.strictEqual(resolvedUrl.hashedDocumentId, "", "No doc id should be present");
			assert.strictEqual(
				resolvedUrl.endpoints.snapshotStorageUrl,
				"",
				"Snapshot url should be empty",
			);

			const [, queryString] = request.url.split("?");
			const searchParams = new URLSearchParams(queryString);
			assert.strictEqual(
				searchParams.get("path"),
				dataStorePath,
				"dataStorePath should match",
			);
			assert.strictEqual(searchParams.get("driveId"), driveId, "Drive id should match");
		};
		await runTest(urlResolverWithShareLinkFetcher);
		await runTest(urlResolverWithoutShareLinkFetcher);
	});

	it("Sharing link should be set when isSharingLinkToRedeem header is set", async () => {
		const url = new URL(sharelink);
		const resolvedUrl = await mockGetFileLink(Promise.resolve(sharelink), async () => {
			storeLocatorInOdspUrl(url, { siteUrl, driveId, itemId, dataStorePath });
			return urlResolverWithShareLinkFetcher.resolve({
				url: url.toString(),
				headers: { [SharingLinkHeader.isSharingLinkToRedeem]: true },
			});
		});
		assert(
			resolvedUrl.shareLinkInfo?.sharingLinkToRedeem !== undefined,
			"Sharing link should be set in resolved url",
		);
	});

	it("Encode and decode nav param", async () => {
		const encodedUrl = new URL(sharelink);
		storeLocatorInOdspUrl(encodedUrl, {
			siteUrl,
			driveId,
			itemId,
			dataStorePath,
			context: contextStringified,
		});

		const locator = getLocatorFromOdspUrl(encodedUrl);
		assert.strictEqual(locator?.driveId, driveId, "Drive id should be equal");
		assert.strictEqual(locator?.itemId, itemId, "Item id should be equal");
		assert.strictEqual(locator?.dataStorePath, dataStorePath, "DataStore path should be equal");
		assert.strictEqual(locator?.siteUrl, siteUrl, "SiteUrl should be equal");
		assert.strictEqual(locator?.context, contextStringified, "Context should be equal");
		const parsedContext = JSON.parse(locator?.context) as Record<
			string | number | symbol,
			unknown
		>;
		assert.deepStrictEqual(parsedContext, contextObject, "Context should be de-serializable");
	});

	it("Check nav param removal for share link", async () => {
		const customShareLink = `${sharelink}?query1=q1`;
		const url = new URL(customShareLink);
		storeLocatorInOdspUrl(url, { siteUrl, driveId, itemId, dataStorePath });
		const resolvedUrl = await mockGetFileLink(Promise.resolve(sharelink), async () => {
			return urlResolverWithShareLinkFetcher.resolve({
				url: url.toString(),
				headers: { [SharingLinkHeader.isSharingLinkToRedeem]: true },
			});
		});
		assert.strictEqual(
			resolvedUrl.shareLinkInfo?.sharingLinkToRedeem,
			customShareLink,
			"Nav param should not exist on sharelink",
		);
	});

	it("appendLocatorParams - Appends the correct nav param", async () => {
		const testQueryParam = { name: "query1", value: "q1" };
		const customShareLink = `${sharelink}?${testQueryParam.name}=${testQueryParam.value}`;
		const testDataStorePath = "/testpath";
		const appName = "AppName1";
		const contextVal = "Context1";
		const testFileVersion = "123";
		const containerName = "containerA";
		const urlResolverForShareLink = new OdspDriverUrlResolverForShareLink(
			undefined /* tokenFetcher */,
			undefined /* logger */,
			appName /* appName */,
			async (_resolvedUrl, _dataStorePath) => contextVal /* context */,
		);
		const resolvedUrl = {
			siteUrl,
			driveId,
			itemId,
			odspResolvedUrl: true,
			fileVersion: testFileVersion,
			codeHint: { containerPackageName: containerName },
		} as unknown as IOdspResolvedUrl;

		const resultUrl = new URL(
			await urlResolverForShareLink.appendLocatorParams(
				customShareLink,
				resolvedUrl,
				testDataStorePath,
			),
		);

		const testQueryParamValue = resultUrl.searchParams.get(testQueryParam.name);
		assert.strictEqual(
			testQueryParamValue,
			testQueryParam.value,
			"original url's query params should be preserved",
		);

		const locatorParamValue = resultUrl.searchParams.get(locatorQueryParamName);
		assert(locatorParamValue != null, "locator parameter should exist is the resulting url");

		const decodedLocatorParam = getLocatorFromOdspUrl(resultUrl);
		assert.strictEqual(decodedLocatorParam?.driveId, driveId, "driveId should be equal");
		assert.strictEqual(decodedLocatorParam?.itemId, itemId, "itemId should be equal");
		assert.strictEqual(decodedLocatorParam?.siteUrl, siteUrl, "siteUrl should be equal");
		assert.strictEqual(
			decodedLocatorParam?.containerPackageName,
			containerName,
			"containerPackageName should be equal",
		);
		assert.strictEqual(
			decodedLocatorParam?.appName,
			appName,
			"appName should be as provided to the OdspDriverUrlResolverForShareLink constructor",
		);
		assert.strictEqual(
			decodedLocatorParam?.dataStorePath,
			testDataStorePath,
			"dataStore path should be as provided to the appendLocatorParams",
		);
		assert.strictEqual(
			decodedLocatorParam?.fileVersion,
			testFileVersion,
			"fileVersion should be equal",
		);
		assert.strictEqual(
			decodedLocatorParam?.context,
			contextVal,
			"context value should be as provided to the OdspDriverUrlResolverForShareLink constructor",
		);
	});
});

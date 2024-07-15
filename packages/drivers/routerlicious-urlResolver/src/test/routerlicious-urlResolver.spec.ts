/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { IRequest } from "@fluidframework/core-interfaces";
import { IResolvedUrl } from "@fluidframework/driver-definitions/internal";

import { Provider } from "../nconf.cjs";
import { RouterliciousUrlResolver } from "../urlResolver.js";

describe("Routerlicious Url Resolver", () => {
	const token = "dummy";
	const hostUrl = "https://dummy.com";
	it("Should resolve the Routerlicious urls correctly", async () => {
		const urlResolver = new RouterliciousUrlResolver(
			undefined,
			async () => Promise.resolve(token),
			hostUrl,
		);
		const url: string =
			"https://www.wu2.prague.office-int.com/loader/fluid/thinkable-list?chaincode=@fluid-example/shared-text@0.11.14146";
		const resolved = (await urlResolver.resolve({ url })) as IResolvedUrl;
		assert.equal(resolved.tokens.jwt, token, "Token does not match");
		assert.equal(
			resolved.endpoints.storageUrl,
			"https://historian.wu2.prague.office-int.com/repos/fluid",
			"Storage url does not match",
		);
		assert.equal(
			resolved.endpoints.deltaStorageUrl,
			"https://alfred.wu2.prague.office-int.com/deltas/fluid/thinkable-list",
			"Delta storage url does not match",
		);
		assert.equal(
			resolved.endpoints.ordererUrl,
			"https://alfred.wu2.prague.office-int.com",
			"Orderer url does not match",
		);
		assert.equal(
			resolved.url,
			"https://wu2.prague.office-int.com/fluid/thinkable-list?chaincode=@fluid-example/shared-text@0.11.14146",
			"FluidUrl does not match",
		);
	});

	it("Should resolve the localhost urls correctly", async () => {
		const urlResolver = new RouterliciousUrlResolver(
			undefined,
			async () => Promise.resolve(token),
			hostUrl,
		);
		const url: string =
			"http://localhost:3000/loader/fluid/damp-competition?chaincode=@fluid-example/shared-text@^0.11.0";
		const resolved = (await urlResolver.resolve({ url })) as IResolvedUrl;
		assert.equal(resolved.tokens.jwt, token, "Token does not match");
		assert.equal(
			resolved.endpoints.storageUrl,
			"http://localhost:3001/repos/fluid",
			"Storage url does not match",
		);
		assert.equal(
			resolved.endpoints.deltaStorageUrl,
			"http://localhost:3003/deltas/fluid/damp-competition",
			"Delta storage url does not match",
		);
		assert.equal(
			resolved.endpoints.ordererUrl,
			"http://localhost:3003",
			"Orderer url does not match",
		);
		assert.equal(
			resolved.url,
			"https://localhost:3003/fluid/damp-competition?chaincode=@fluid-example/shared-text@^0.11.0",
			"FluidUrl does not match",
		);
	});

	it("Should handle local External request", async () => {
		const request: IRequest = {
			url: "/loader/fluid/damp-competition?chaincode=@fluid-example/shared-text@^0.11.0",
		};

		const provider = new Provider({})
			.defaults({
				a: "hell",
				worker: {
					serverUrl: "http://localhost:3003",
					alfredUrl: "http://alfred:3000",
					blobStorageUrl: "http://historian:3000",
					internalBlobStorageUrl: "http://historian:3000",
				},
			})
			.use("memory");

		const config = {
			provider,
			tenantId: "fluid",
			documentId: "damp-competition",
		};
		const urlResolver = new RouterliciousUrlResolver(
			config,
			async () => Promise.resolve(token),
			hostUrl,
		);

		const { endpoints, url } = (await urlResolver.resolve(request)) as IResolvedUrl;

		assert.equal(
			endpoints.storageUrl,
			"http://localhost:3001/repos/fluid",
			"Improperly Formed storageUrl",
		);
		assert.equal(
			endpoints.deltaStorageUrl,
			"http://localhost:3003/deltas/fluid/damp-competition",
			"Improperly Formed deltaStorageUrl",
		);
		assert.equal(
			endpoints.ordererUrl,
			"http://localhost:3003",
			"Improperly Formed OrdererUrl",
		);
		assert.equal(
			url,
			"https://localhost:3003/fluid/damp-competition?chaincode=@fluid-example/shared-text@^0.11.0",
			"Improperly formed FluidURL",
		);
	});

	it("Should handle local Internal request", async () => {
		const request: IRequest = {
			url: "http://gateway:3000/loader/fluid/damp-competition?chaincode=@fluid-example/shared-text@^0.11.0",
		};

		const provider = new Provider({})
			.defaults({
				worker: {
					serverUrl: "http://localhost:3003",
					alfredUrl: "http://alfred:3000",
					blobStorageUrl: "http://historian:3000",
					internalBlobStorageUrl: "http://historian:3000",
				},
			})
			.use("memory");

		const config = {
			provider,
			tenantId: "fluid",
			documentId: "damp-competition",
		};

		const urlResolver = new RouterliciousUrlResolver(
			config,
			async () => Promise.resolve(token),
			hostUrl,
		);
		const { endpoints, url } = (await urlResolver.resolve(request)) as IResolvedUrl;

		assert.equal(
			endpoints.storageUrl,
			"http://historian:3000/repos/fluid",
			"Improperly Formed storageUrl",
		);
		assert.equal(
			endpoints.deltaStorageUrl,
			"http://alfred:3000/deltas/fluid/damp-competition",
			"Improperly Formed deltaStorageUrl",
		);
		assert.equal(endpoints.ordererUrl, "http://alfred:3000", "Improperly Formed OrdererUrl");
		assert.equal(
			url,
			"https://localhost:3003/fluid/damp-competition?chaincode=@fluid-example/shared-text@^0.11.0",
			"Improperly formed FluidURL",
		);
	});

	it("Should handle Deployed Internal request", async () => {
		const request: IRequest = {
			url: "http://angry-dog-gateway:3000/loader/fluid/damp-competition?chaincode=@fluid-example/shared-text@^0.11.0",
		};
		const provider = new Provider({})
			.defaults({
				worker: {
					serverUrl: "http://localhost:3003",
					alfredUrl: "http://wiggly-wombat-alfred:3000",
					blobStorageUrl: "http://historian:3000",
					internalBlobStorageUrl: "http://smelly-wolf-historian:3000",
				},
			})
			.use("memory");

		const config = {
			provider,
			tenantId: "fluid",
			documentId: "damp-competition",
		};

		const urlResolver = new RouterliciousUrlResolver(
			config,
			async () => Promise.resolve(token),
			hostUrl,
		);
		const { endpoints, url } = (await urlResolver.resolve(request)) as IResolvedUrl;

		assert.equal(
			endpoints.storageUrl,
			"http://smelly-wolf-historian:3000/repos/fluid",
			"Improperly Formed storageUrl",
		);
		assert.equal(
			endpoints.deltaStorageUrl,
			"http://wiggly-wombat-alfred:3000/deltas/fluid/damp-competition",
			"Improperly Formed deltaStorageUrl",
		);
		assert.equal(
			endpoints.ordererUrl,
			"http://wiggly-wombat-alfred:3000",
			"Improperly Formed OrdererUrl",
		);
		assert.equal(
			url,
			"https://localhost:3003/fluid/damp-competition?chaincode=@fluid-example/shared-text@^0.11.0",
			"Improperly formed FluidURL",
		);
	});

	it("Should handle deployed External request", async () => {
		const request: IRequest = {
			url: "/loader/fluid/damp-competition?chaincode=@fluid-example/shared-text@^0.11.0",
		};

		const provider = new Provider({})
			.defaults({
				worker: {
					serverUrl: "https://alfred.wu2-ppe.prague.office-int.com",
					alfredUrl: "http://wiggly-wombat-alfred",
					blobStorageUrl: "https://historian.wu2-ppe.prague.office-int.com",
					internalBlobStorageUrl: "http://smelly-wolf-historian",
				},
			})
			.use("memory");

		const config = {
			provider,
			tenantId: "fluid",
			documentId: "damp-competition",
		};

		const urlResolver = new RouterliciousUrlResolver(
			config,
			async () => Promise.resolve(token),
			hostUrl,
		);
		const { endpoints, url } = (await urlResolver.resolve(request)) as IResolvedUrl;

		assert.equal(
			endpoints.storageUrl,
			"https://historian.wu2-ppe.prague.office-int.com/repos/fluid",
			"Storage url does not match",
		);
		assert.equal(
			endpoints.deltaStorageUrl,
			"https://alfred.wu2-ppe.prague.office-int.com/deltas/fluid/damp-competition",
			"Delta storage url does not match",
		);
		assert.equal(
			endpoints.ordererUrl,
			"https://alfred.wu2-ppe.prague.office-int.com",
			"Orderer url does not match",
		);
		assert.equal(
			url,
			"https://alfred.wu2-ppe.prague.office-int.com/fluid/damp-competition?chaincode=@fluid-example/shared-text@^0.11.0",
			"FluidUrl does not match",
		);
	});

	it("Should return the absolute url when requested", async () => {
		const urlResolver = new RouterliciousUrlResolver(
			undefined,
			async () => Promise.resolve(token),
			hostUrl,
		);
		const url: string =
			"http://localhost:3000/loader/fluid/damp-competition?chaincode=@fluid-example/shared-text@^0.11.0";
		const resolved = (await urlResolver.resolve({ url })) as IResolvedUrl;
		const absoluteUrl = await urlResolver.getAbsoluteUrl(resolved, "relative");
		assert.strictEqual(
			absoluteUrl,
			`${hostUrl}/fluid/damp-competition/relative`,
			"Absolute url should match",
		);
	});
});

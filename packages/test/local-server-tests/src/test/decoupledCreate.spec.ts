/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	createDetachedContainer,
	loadExistingContainer,
} from "@fluidframework/container-loader/internal";
import type { IRequest } from "@fluidframework/core-interfaces";
import type { FluidObject } from "@fluidframework/core-interfaces/internal";
import {
	IDocumentServiceFactory,
	type IResolvedUrl,
	type ISummaryTree,
} from "@fluidframework/driver-definitions/internal";
import {
	LocalDocumentServiceFactory,
	LocalResolver,
} from "@fluidframework/local-driver/internal";
import {
	LocalDeltaConnectionServer,
	type ILocalDeltaConnectionServer,
} from "@fluidframework/server-local-server";
import type { ITestFluidObject } from "@fluidframework/test-utils/internal";

import { createLoader } from "../utils.js";

function createDSFWithOutOfBandCreate({
	deltaConnectionServer,
	createContainerCallback,
}: {
	deltaConnectionServer: ILocalDeltaConnectionServer;
	createContainerCallback: (
		summary: ISummaryTree | undefined,
		resolvedUrl: IResolvedUrl,
	) => Promise<IRequest>;
}) {
	return new Proxy<IDocumentServiceFactory>(
		new LocalDocumentServiceFactory(deltaConnectionServer),
		{
			get: (t, p: keyof IDocumentServiceFactory, r) => {
				if (p === "createContainer") {
					return async (summary, resolvedUrl, logger, clientIsSummarizer) => {
						const url = await createContainerCallback(summary, resolvedUrl);
						// this is more like the load flow, where we resolve the url
						// and create the document service, and it works here, as
						// the callback actually does the work of creating the container.
						const resolver = new LocalResolver();
						return t.createDocumentService(
							await resolver.resolve(url),
							logger,
							clientIsSummarizer,
						);
					};
				}

				return Reflect.get(t, p, r);
			},
		},
	);
}

async function createContainerOutOfBand(
	deltaConnectionServer: ILocalDeltaConnectionServer,
	createContainerParams: {
		summary: ISummaryTree | undefined;
		resolvedUrl: IResolvedUrl;
	},
) {
	// this actually creates the container
	const { summary, resolvedUrl } = createContainerParams;
	const documentServiceFactory = new LocalDocumentServiceFactory(deltaConnectionServer);
	const documentService = await documentServiceFactory.createContainer(summary, resolvedUrl);
	const resolver = new LocalResolver();
	return resolver.getAbsoluteUrl(documentService.resolvedUrl, "");
}

describe("Scenario Test", () => {
	it("Create container via a decoupled out of band function and validate both attaching container and freshly loaded container both work.", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();

		/*
		 * Setup a document service factory that uses a user specifiable createContainerCallback.
		 * This callback could make a different server call, and just needs to return the url
		 * of the newly created container/file.
		 */
		let request: IRequest | undefined;
		const documentServiceFactory = createDSFWithOutOfBandCreate({
			deltaConnectionServer,
			createContainerCallback: async (summary, resolvedUrl) =>
				(request = {
					url: await createContainerOutOfBand(deltaConnectionServer, {
						summary,
						resolvedUrl,
					}),
				}),
		});

		const { loaderProps, codeDetails, urlResolver } = createLoader({
			deltaConnectionServer,
			documentServiceFactory,
		});

		const container = await createDetachedContainer({ ...loaderProps, codeDetails });

		{
			// put a bit of data in the detached container so we can validate later
			const entryPoint: FluidObject<ITestFluidObject> = await container.getEntryPoint();
			entryPoint.ITestFluidObject?.root.set("someKey", "someValue");
		}

		// kicking off attach will end up calling the create container callback
		// which will actually create the container, and eventually finish the attach
		await container.attach(urlResolver.createCreateNewRequest("test"));

		{
			// just reuse the same server, nothing else from the initial create
			const { loaderProps: loaderProps2 } = createLoader({ deltaConnectionServer });

			// ensure and use the url we got from out of band create to load the container
			assert(request !== undefined);
			const container2 = await loadExistingContainer({ ...loaderProps2, request });

			// ensure the newly loaded container has the data we expect.
			const entryPoint: FluidObject<ITestFluidObject> = await container2.getEntryPoint();
			assert.strictEqual(entryPoint.ITestFluidObject?.root.get("someKey"), "someValue");
		}
	});
});

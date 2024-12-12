/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type IContainer, LoaderHeader } from "@fluidframework/container-definitions/internal";
import {
	createDetachedContainer,
	ILoaderProps,
	loadExistingContainer,
} from "@fluidframework/container-loader/internal";
import type { IRequest } from "@fluidframework/core-interfaces";
import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";

import type { ISimpleLoader } from "./interfaces.js";

/**
 * Get a promise that will resolve once the container has advanced to at least the given sequence number
 * @param container - the container to observe
 * @param sequenceNumber - the sequence number we want to load to at minimum
 */
export const waitForAtLeastSequenceNumber = async (
	container: IContainer,
	sequenceNumber: number,
): Promise<void> =>
	new Promise<void>((resolve) => {
		if (sequenceNumber <= container.deltaManager.lastSequenceNumber) {
			resolve();
		}
		const callbackOps = (message: ISequencedDocumentMessage): void => {
			if (sequenceNumber <= message.sequenceNumber) {
				resolve();
				container.deltaManager.off("op", callbackOps);
			}
		};
		container.deltaManager.on("op", callbackOps);
	});

/**
 * @alpha
 */
export class SimpleLoader implements ISimpleLoader {
	private readonly loaderProps: ILoaderProps;
	private readonly generateCreateNewRequest: () => IRequest;

	// TODO: See if there's a nicer way to parameterize the createNew request.
	// Here we specifically pick just the loader props we know we need to keep API exposure low.  Fine to add more
	// here if we determine they're needed, but they should be picked explicitly (e.g. avoid "scope").
	public constructor(
		props: Pick<
			ILoaderProps,
			"urlResolver" | "documentServiceFactory" | "codeLoader" | "logger"
		> & {
			generateCreateNewRequest: () => IRequest;
		},
	) {
		this.loaderProps = {
			urlResolver: props.urlResolver,
			documentServiceFactory: props.documentServiceFactory,
			codeLoader: props.codeLoader,
			logger: props.logger,
		};
		this.generateCreateNewRequest = props.generateCreateNewRequest;
	}

	public async supportsVersion(version: string): Promise<boolean> {
		// To answer the question of whether we support a given version, we would need to query the codeLoader
		// to see if it thinks it can load the requested version.  But for now, ICodeDetailsLoader doesn't have
		// a supports() method.  We could attempt a load and catch the error, but it might not be desirable to
		// load code just to check.  It might be desirable to add a supports() method to ICodeDetailsLoader.
		return true;
	}

	// It would be preferable for attaching to look more like service.attach(container) rather than returning an attach
	// callback here, but this callback at least allows us to keep the method off the container interface.
	// TODO: Consider making the version param optional, and in that case having a mechanism to query the codeLoader
	// for the latest/default version to use?
	public async createDetached(
		version: string,
	): Promise<{ container: IContainer; attach: () => Promise<string> }> {
		const container = await createDetachedContainer({
			...this.loaderProps,
			codeDetails: { package: version },
		});
		// The attach callback lets us defer the attach so the caller can do whatever initialization pre-attach,
		// without leaking out the loader, service, etc.  We also return the container ID here so we don't have
		// to stamp it on something that would rather not know it (e.g. the container).
		const attach = async (): Promise<string> => {
			await container.attach(this.generateCreateNewRequest());
			if (container.resolvedUrl === undefined) {
				throw new Error("Resolved Url not available on attached container");
			}
			return container.resolvedUrl.id;
		};
		return { container, attach };
	}

	public async loadExisting(id: string): Promise<IContainer> {
		return loadExistingContainer({
			...this.loaderProps,
			request: {
				url: id,
				headers: {
					[LoaderHeader.loadMode]: {
						// Here we use "all" to ensure we are caught up before returning.  This is particularly important
						// for direct-link scenarios, where the user might have a direct link to a data object that was
						// just attached (i.e. the "attach" op and the "set" of the handle into some map is in the
						// trailing ops).  If we don't fully process those ops, the expected object won't be found.
						opsBeforeReturn: "all",
					},
				},
			},
		});
	}
}

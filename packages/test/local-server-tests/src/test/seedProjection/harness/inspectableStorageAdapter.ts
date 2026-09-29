/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IRequest } from "@fluidframework/core-interfaces";
import type {
	IDocumentService,
	IDocumentServiceFactory,
	IDocumentStorageService,
	ISnapshot,
	ISummaryContext,
	ISummaryTree,
	IUrlResolver,
} from "@fluidframework/driver-definitions/internal";
import { wrapObjectAndOverride } from "@fluidframework/test-runtime-utils/internal";

/** One recorded client upload attempt, including failed attempts; this is not a service summary inventory. */
export interface ISummaryUploadAttempt {
	/** Absolute URL identifying which document this attempt belongs to. */
	documentUrl: string;
	/** Application/native tree submitted to the storage upload API. */
	summary: ISummaryTree;
	/** Upload parent handles and reference checkpoint supplied by the runtime. */
	context: ISummaryContext;
}

/** Independent read-only storage inspection, outside any client's projected runtime context or blob overlay. */
export interface ISnapshotInspection {
	/** Requested persisted snapshot in driver app-root form, with whatever blob bodies that fetch included. */
	snapshot: ISnapshot;
	/** Read a persisted blob by its storage ID, including bodies omitted by loading groups. */
	readBlob: IDocumentStorageService["readBlob"];
	/** Release the document service opened for this inspection; does not close the backend or other clients. */
	dispose: () => void;
}

/**
 * Inspectable driver boundary for creating documents, observing client uploads, and reading persisted data.
 * This contract is independent of any application summary format or runtime projection.
 * One adapter can serve multiple files and clients; it is not a single document handle.
 */
export interface IInspectableStorageAdapter {
	/** Driver factory used by Loader instances to open and collaborate on this backend's files. */
	documentServiceFactory: IDocumentServiceFactory;
	/** Backend URL resolver used for creation, client loading, and independent inspection. */
	urlResolver: IUrlResolver;
	/** Persist a complete initial summary without an app Container; return its loadable absolute document URL. */
	create(summary: ISummaryTree): Promise<string>;
	/**
	 * Open a fresh storage service and fetch a file's persisted snapshot, not its current op-updated model.
	 * version selects a snapshot; omission requests the backend's default/latest available version.
	 * groups selects loading groups; omission makes an ordinary initial/default fetch.
	 * The caller must dispose the returned inspection even when its validation fails.
	 */
	inspect(url: string, version?: string, groups?: string[]): Promise<ISnapshotInspection>;
	/** Storage guarantees ordinary snapshot fetches retain grouped blob IDs but omit unrequested group bodies. */
	omitsUnrequestedGroupBlobs: boolean;
	/** Storage preserves group IDs and supports explicit group fetches; this alone does not guarantee body omission. */
	supportsLoadingGroups: boolean;
	/** Append-only client upload-attempt journal across all files, excluding create(); neither latest-only nor ACKed-only. */
	uploads: ISummaryUploadAttempt[];
	/** Shut down resources owned by this backend after all clients and inspections have been disposed. */
	close(): Promise<void>;
}

/** Driver configuration supplied by the host; none of these settings depend on the document's format. */
export interface IInspectableStorageAdapterOptions {
	/** Already configured factory, including the host's authentication and cache lifecycle. */
	documentServiceFactory: IDocumentServiceFactory;
	/** Resolver paired with the factory for this service. */
	urlResolver: IUrlResolver;
	/**
	 * Return a fresh driver-specific creation request, including required paths and headers.
	 * A host can bind ITestDriver.createCreateNewRequest or a driver's own request builder here.
	 * IUrlResolver has no generic creation-request API; the adapter must not invent a service URL.
	 */
	createCreateNewRequest: () => IRequest | Promise<IRequest>;
	/** Whether the supplied storage supports explicit group fetches and preserves group IDs. */
	supportsLoadingGroups: boolean;
	/** Whether ordinary snapshot fetches omit unrequested group bodies, not merely support group fetches. */
	omitsUnrequestedGroupBlobs: boolean;
	/** Release host-owned resources after clients and inspections are disposed; omitted for borrowed factories. */
	close?: () => void | Promise<void>;
}

/**
 * Wrap an arbitrary configured driver with independent creation/readback and a client upload journal.
 * Auth, service-specific create requests, and resource ownership remain explicit host responsibilities.
 * External create() and inspect() use the raw factory so neither is mistaken for a client summary upload.
 */
export function createInspectableStorageAdapter(
	options: IInspectableStorageAdapterOptions,
): IInspectableStorageAdapter {
	const { documentServiceFactory: rawFactory, urlResolver } = options;
	const uploads: ISummaryUploadAttempt[] = [];

	/** Capture identity per connection, not per factory, before observing that document's storage calls. */
	async function observeService(service: IDocumentService): Promise<IDocumentService> {
		try {
			const documentUrl = await urlResolver.getAbsoluteUrl(service.resolvedUrl, "");
			return wrapObjectAndOverride(
				service,
				{
					connectToStorage: {
						uploadSummaryWithContext: (storage) => async (summary, context) => {
							// Record the call before delegation: rejected uploads are attempts too, not accepted summaries.
							uploads.push({ documentUrl, summary, context });
							return storage.uploadSummaryWithContext(summary, context);
						},
					},
				},
				// Observation must preserve the real driver/storage receiver, not inject sibling-call overrides.
				{ receiver: "target" },
			);
		} catch (error) {
			// A URL failure must not leak a service which has not yet been returned to its client.
			service.dispose();
			throw error;
		}
	}

	const documentServiceFactory = wrapObjectAndOverride(
		rawFactory,
		{
			createDocumentService:
				(factory) =>
				async (...args) =>
					observeService(await factory.createDocumentService(...args)),
			createContainer:
				(factory) =>
				async (...args) =>
					observeService(await factory.createContainer(...args)),
		},
		{ receiver: "target" },
	);

	return {
		documentServiceFactory,
		urlResolver,
		supportsLoadingGroups: options.supportsLoadingGroups,
		omitsUnrequestedGroupBlobs: options.omitsUnrequestedGroupBlobs,
		uploads,
		async create(summary) {
			const request = await options.createCreateNewRequest();
			const resolved = await urlResolver.resolve(request);
			if (resolved === undefined) {
				throw new Error("The URL resolver did not resolve the create-new request");
			}
			const service = await rawFactory.createContainer(summary, resolved);
			try {
				return await urlResolver.getAbsoluteUrl(service.resolvedUrl, "");
			} finally {
				service.dispose();
			}
		},
		async inspect(url, version, groups) {
			const resolved = await urlResolver.resolve({ url });
			if (resolved === undefined) {
				throw new Error("The URL resolver did not resolve the inspection URL");
			}
			const service = await rawFactory.createDocumentService(resolved);
			try {
				const storage = await service.connectToStorage();
				if (storage.getSnapshot === undefined) {
					throw new Error("The storage adapter does not support getSnapshot");
				}
				return {
					snapshot: await storage.getSnapshot({ versionId: version, loadingGroupIds: groups }),
					readBlob: storage.readBlob.bind(storage),
					dispose: () => service.dispose(),
				};
			} catch (error) {
				service.dispose();
				throw error;
			}
		},
		async close() {
			await options.close?.();
		},
	};
}

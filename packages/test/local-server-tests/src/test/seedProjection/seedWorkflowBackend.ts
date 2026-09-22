/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IDocumentServiceFactory,
	IDocumentStorageService,
	ISnapshot,
	ISummaryContext,
	ISummaryTree,
	IUrlResolver,
} from "@fluidframework/driver-definitions/internal";

/** One recorded client upload attempt, including failed attempts; this is not a service summary inventory. */
export interface SummaryUploadAttempt {
	/** Absolute URL identifying which document this attempt belongs to. */
	documentUrl: string;
	/** Application/native tree submitted to the storage upload API. */
	summary: ISummaryTree;
	/** Upload parent handles and reference checkpoint supplied by the runtime. */
	context: ISummaryContext;
}

/** Independent read-only storage inspection, outside any client's projected runtime context or blob overlay. */
export interface SnapshotInspection {
	/** Requested persisted snapshot in driver app-root form, with whatever blob bodies that fetch included. */
	snapshot: ISnapshot;
	/** Read a persisted blob by its storage ID, including bodies omitted by loading groups. */
	readBlob: IDocumentStorageService["readBlob"];
	/** Release the document service opened for this inspection; does not close the backend or other clients. */
	dispose: () => void;
}

/**
 * Test-harness service/driver boundary for running the same scenario against different storage backends.
 * Obtain one from createLocalSeedBackend(); future adapters supply their own driver, auth, and creation
 * implementation. One backend can own multiple files and clients; it is not a single document handle.
 * The lifecycle scenarios currently start with a fresh backend so their upload journal starts empty.
 */
export interface SeedWorkflowBackend {
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
	inspect(url: string, version?: string, groups?: string[]): Promise<SnapshotInspection>;
	/** Storage guarantees ordinary snapshot fetches retain grouped blob IDs but omit unrequested group bodies. */
	omitsUnrequestedGroupBlobs: boolean;
	/** Storage preserves group IDs and supports explicit group fetches; this alone does not guarantee body omission. */
	supportsLoadingGroups: boolean;
	/** Append-only client upload-attempt journal across all files, excluding create(); neither latest-only nor ACKed-only. */
	uploads: SummaryUploadAttempt[];
	/** Shut down resources owned by this backend after all clients and inspections have been disposed. */
	close(): Promise<void>;
}

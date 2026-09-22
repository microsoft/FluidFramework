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

/** The workflow has no LocalDeltaConnectionServer or localhost knowledge. */
export interface ReferenceBackend {
	documentServiceFactory: IDocumentServiceFactory;
	urlResolver: IUrlResolver;
	/** Out-of-band backend creation, without constructing an application Container. */
	create(summary: ISummaryTree): Promise<string>;
	/** Snapshot inspection is separate from the application's storage overlay. */
	inspect(
		url: string,
		version?: string,
		groups?: string[],
	): Promise<{
		snapshot: ISnapshot;
		readBlob: IDocumentStorageService["readBlob"];
		dispose: () => void;
	}>;
	/** Stronger than the generic getSnapshot contract; only local guarantees this here. */
	expectGroupOmission: boolean;
	supportsLoadingGroups: boolean;
	uploads: { summary: ISummaryTree; context: ISummaryContext }[];
	close(): Promise<void>;
}

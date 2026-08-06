/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { NetworkError } from "@fluidframework/server-services-client";
import type {
	IDocumentManager,
	IDocument,
	IDocumentStaticProperties,
} from "@fluidframework/server-services-core";

export class TestDocumentManager implements IDocumentManager {
	// eslint-disable-next-line @rushstack/no-new-null
	public async readDocument(tenantId: string, documentId: string): Promise<IDocument | null> {
		throw new NetworkError(501, "Not implemented", false, true);
	}

	public async readStaticProperties(
		tenantId: string,
		documentId: string,
	): Promise<IDocumentStaticProperties | undefined> {
		throw new NetworkError(501, "Not implemented", false, true);
	}

	public async purgeStaticCache(documentId: string): Promise<void>;
	public async purgeStaticCache(tenantId: string, documentId: string): Promise<void>;
	public async purgeStaticCache(
		tenantIdOrDocumentId: string,
		documentId?: string,
	): Promise<void> {
		throw new NetworkError(501, "Not implemented", false, true);
	}
}

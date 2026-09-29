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
import type { ISummaryDocumentManager } from "../../services/documentManager";

export class TestDocumentManager implements IDocumentManager, ISummaryDocumentManager {
	public readonly supportsSummaryStaticProperties = true;
	/* eslint-disable @rushstack/no-new-null */
	public async readDocument(
		tenantId: string,
		documentId: string,
		options?: { accessToken?: string },
	): Promise<IDocument | null> {
		throw new NetworkError(501, "Not implemented", false, true);
	}
	/* eslint-enable @rushstack/no-new-null */

	public async readStaticProperties(
		tenantId: string,
		documentId: string,
		options?: { accessToken?: string },
	): Promise<IDocumentStaticProperties | undefined> {
		throw new NetworkError(501, "Not implemented", false, true);
	}

	public async readStaticPropertiesForSummary(
		tenantId: string,
		documentId: string,
		options?: { accessToken?: string },
	): Promise<IDocumentStaticProperties | undefined> {
		return this.readStaticProperties(tenantId, documentId, options);
	}

	public async purgeStaticCache(
		tenantId: string,
		documentId: string,
		createTime?: number,
	): Promise<void> {
		throw new NetworkError(501, "Not implemented", false, true);
	}
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ScopeType } from "@fluidframework/protocol-definitions";
import { BasicRestWrapper } from "@fluidframework/server-services-client";
import { IDocumentManager, IDocument } from "@fluidframework/server-services-core";
import { generateToken, getCorrelationId } from "@fluidframework/server-services-utils";

/**
 * Manager to fetch document from Alfred using the internal URL.
 */
export class DocumentManager implements IDocumentManager {
	constructor(private readonly internalAlfredUrl: string, private readonly key: string) {}

	public async readDocument(tenantId: string, documentId: string): Promise<IDocument> {
		const restWrapper = await this.getBasicRestWrapper(tenantId, documentId);
		return restWrapper.get<IDocument>(`/documents/${tenantId}/${documentId}`);
	}

	private async getBasicRestWrapper(tenantId: string, documentId: string) {
		const getDefaultHeaders = () => {
			const jwtToken = generateToken(tenantId, documentId, this.key, [ScopeType.DocRead]);
			return {
				Authorization: `Basic ${jwtToken}`,
			};
		};

		const restWrapper = new BasicRestWrapper(
			this.internalAlfredUrl,
			undefined /* defaultQueryString */,
			undefined /* maxBodyLength */,
			undefined /* maxContentLength */,
			getDefaultHeaders(),
			undefined /* Axios */,
			undefined /* refreshDefaultQueryString */,
			getDefaultHeaders /* refreshDefaultHeaders */,
			getCorrelationId /* getCorrelationId */,
		);
		return restWrapper;
	}
}

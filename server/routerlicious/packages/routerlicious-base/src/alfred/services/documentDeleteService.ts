/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentDeleteService } from "@fluidframework/server-services-core";
import { NonImplementedError } from "@fluidframework/server-services-client";

export class DocumentDeleteService implements IDocumentDeleteService {
	constructor() {}

	public async deleteDocument(tenantId: string, documentId: string): Promise<void> {
		throw new NonImplementedError("Function is not implemented.");
	}
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocument, IDocumentStaticProperties } from "./document";

export interface IDocumentManager {
	readDocument(tenantId: string, documentId: string): Promise<IDocument>;
	readStaticData(tenantId: string, documentId: string): Promise<IDocumentStaticProperties>;
}

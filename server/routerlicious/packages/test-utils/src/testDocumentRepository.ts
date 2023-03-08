/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocument, IDocumentRepository } from "@fluidframework/server-services-core";

export class TestDocumentRepository implements IDocumentRepository {
    async createDocument(document: IDocument): Promise<any> {
        throw new Error("Method not implemented. Provide your own mock.");
    }
    async readDocument(filter: any): Promise<IDocument> {
        throw new Error("Method not implemented. Provide your own mock.");
    }
    
    async updateDocument(filter: any, update: any, option?: any): Promise<void> {
        throw new Error("Method not implemented. Provide your own mock.");
    }
    
    async findAndCreateDocument(filter: any, value: any, option: any): Promise<{ value: IDocument; existing: boolean; }> {
        throw new Error("Method not implemented. Provide your own mock.");
    }

    async findAndUpdateDocument(filter: any, value: any, option: any): Promise<{ value: IDocument; existing: boolean; }> {
        throw new Error("Method not implemented. Provide your own mock.");
    }
}
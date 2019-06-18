/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentService, IDocumentServiceFactory, IResolvedUrl } from "@prague/container-definitions";
import * as fs from "fs";
import { FileDocumentService } from "./fileDocumentService";

/**
 * Factory for creating the file document service. Use this if you want to
 * use the local file storage as underlying storage.
 */
export class FileDocumentServiceFactory implements IDocumentServiceFactory {

    constructor(private readonly path: string) {}

    /**
     * Creates the file document service if the path exists.
     *
     * @param fileURL - Path of directory containing ops/snapshots.
     * @returns file document service.
     */
    public async createDocumentService(fileURL: IResolvedUrl): Promise<IDocumentService> {
        if (fs.existsSync(this.path)) {
            return new FileDocumentService(this.path);
        } else {
            return Promise.reject("File does not exist");
        }
    }
}

import * as resources from "gitresources";
import * as api from "../../api-core";
import { DocumentDeltaStorageService, DocumentResource, DocumentStorageService } from "../../socket-storage";
import { TestDocumentDeltaConnection } from "./";

export class TestDocumentService implements api.IDocumentService {

    constructor(
        url: string,
        private deltaStorage: api.IDeltaStorageService,
        private blobStorge: api.IBlobStorageService) {
    }

    public async connect(
        id: string,
        version: resources.ICommit,
        connect: boolean,
        encrypted: boolean): Promise<api.IDocumentResource> {
        const deltaConnection = new TestDocumentDeltaConnection(
            this,
            id,
            "test-client",
            false,
            "",
            "");
        const deltaStorage = new DocumentDeltaStorageService(id, this.deltaStorage);
        const documentStorage = new DocumentStorageService(id, version, this.blobStorge);
        const document = new DocumentResource(
            id,
            "test-client",
            false,
            version,
            null,
            deltaConnection,
            documentStorage,
            deltaStorage,
            [],
            [],
            [],
            0,
            0,
            null);
        return document;
    }

    public branch(id: string): Promise<string> {
        return Promise.reject("Not implemented");
    }

    public emit(event: string, ...args: any[]) {
        // Emit here.
    }
}

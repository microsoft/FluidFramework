import * as resources from "gitresources";
import * as api from "../../api";
import { Document, DocumentDeltaStorageService, DocumentStorageService } from "../../socket-storage";
import { TestDocumentDeltaConnection } from "./";

export class TestDocumentService implements api.IDocumentService {

        constructor(url: string, private deltaStorage: api.IDeltaStorageService,
                    private blobStorge: api.IBlobStorageService) {
            }

            public async connect(
                id: string,
                version: resources.ICommit,
                connect: boolean,
                encrypted: boolean): Promise<api.IDocument> {
                    const deltaConnection = new TestDocumentDeltaConnection(
                        this,
                        id,
                        "test-client",
                        false,
                        "",
                        "");
                    const deltaStorage = new DocumentDeltaStorageService(id, this.deltaStorage);
                    const documentStorage = new DocumentStorageService(id, version, this.blobStorge);
                    const document = new Document(
                        id,
                        "test-client",
                        false,
                        version,
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

            public emit(event: string, ...args: any[]) {
                // Emit here.
            }
    }

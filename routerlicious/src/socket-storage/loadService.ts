import * as resources from "gitresources";
import performanceNow = require("performance-now");
import * as api from "../api-core";
import { DocumentStorageService } from "./blobStorageService";
import { debug } from "./debug";
import { DocumentDeltaStorageService } from "./deltaStorageService";
import { DocumentResource, emptyHeader} from "./documentService";
import { IdleDocumentDeltaConnection } from "./idleDocumentDeltaConnection";

/**
 * The LoadService connects to storage and loads a specific version of the document.
 */
export class LoadService implements api.IDocumentService {
    constructor(url: string, private deltaStorage: api.IDeltaStorageService,
                private blobStorge: api.IBlobStorageService) {
        debug(`Creating document load service ${performanceNow()}`);
    }

    public async connect(
        id: string,
        version: resources.ICommit,
        connect: boolean,
        encrypted: boolean): Promise<api.IDocumentResource> {

        debug(`Connecting to ${id} - ${performanceNow()}`);

        const headerP = version
            ? this.blobStorge.getHeader(id, version)
            : Promise.resolve(emptyHeader);

        const header = await headerP;

        debug(`Connected to ${id} - ${performanceNow()}`);

        const deltaConnection = new IdleDocumentDeltaConnection(
            this,
            id,
            "loadClint",
            encrypted,
            "",
            "");
        const deltaStorage = new DocumentDeltaStorageService(id, this.deltaStorage);
        const documentStorage = new DocumentStorageService(id, version, this.blobStorge);

        const document = new DocumentResource(
            id,
            "loadClient",
            true,
            version,
            deltaConnection,
            documentStorage,
            deltaStorage,
            header.distributedObjects,
            null,
            header.transformedMessages,
            header.attributes.sequenceNumber,
            header.attributes.minimumSequenceNumber,
            header.tree);
        return document;
    }

}

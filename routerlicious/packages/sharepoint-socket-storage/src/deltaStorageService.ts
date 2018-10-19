import * as api from "@prague/runtime-definitions";
// tslint:disable-next-line:match-default-export-name
import axios from "axios";
import * as querystring from "querystring";
import { IDeltaFeedResponse } from "./sharepointContracts";

/**
 * Storage service limited to only being able to fetch documents for a specific document
 */
export class DocumentDeltaStorageService implements api.IDocumentDeltaStorageService {
    constructor(
        private tenantId: string,
        private id: string,
        private token: string,
        private storageService: api.IDeltaStorageService) {
    }

    /* tslint:disable:promise-function-async */
    public get(from?: number, to?: number): Promise<api.ISequencedDocumentMessage[]> {
        return this.storageService.get(this.tenantId, this.id, this.token, from, to);
    }
}

/**
 * Provides access to the sharepoint delta storage
 */
export class SharepointDeltaStorageService implements api.IDeltaStorageService {
    constructor(private deltaFeedUrl: string) {
    }

    public async get(
        tenantId: string,
        id: string,
        token: string,
        from?: number,
        to?: number): Promise<api.ISequencedDocumentMessage[]> {
        const requestUrl = this.constructUrl(from, to);
        let headers = null;
        if (token) {
            headers = {
                Authorization: `Bearer ${new Buffer(`${token}`)}`,
            };
        }
        const result = await axios.get<IDeltaFeedResponse>(requestUrl, { headers });
        return result.data.opStream;
    }

    public constructUrl(
        from?: number,
        to?: number): string {
        let deltaFeedUrl: string;
        const queryFilter = `sequenceNumber ge ${from} and sequenceNumber le ${to}`;
        const query = querystring.stringify({ filter: queryFilter });
        deltaFeedUrl = `${this.deltaFeedUrl}?$${query}`;

        return deltaFeedUrl;
    }
}

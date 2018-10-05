import * as api from "@prague/runtime-definitions";
// tslint:disable-next-line:match-default-export-name
import axios from "axios";
import * as querystring from "querystring";

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
 * Provides access to the underlying delta storage on the server
 */
export class DeltaStorageService implements api.IDeltaStorageService {
    constructor(private url: string) {
    }

    public async get(
        tenantId: string,
        id: string,
        token: string,
        from?: number,
        to?: number): Promise<api.ISequencedDocumentMessage[]> {
        const query = querystring.stringify({ from, to });

        let headers = null;
        if (token) {
            headers = {
                Authorization: `Basic ${new Buffer(`${tenantId}:${token}`).toString("base64")}`,
            };
        }

        const result = await axios.get<api.ISequencedDocumentMessage[]>(
            `${this.url}/deltas/${encodeURIComponent(tenantId)}/${encodeURIComponent(id)}?${query}`, { headers });
        return result.data;
    }
}

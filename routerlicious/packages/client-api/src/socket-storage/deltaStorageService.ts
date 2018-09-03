import {
    IDeltaStorageService,
    IDocumentDeltaStorageService,
    ISequencedDocumentMessage,
} from "@prague/runtime-definitions";
import axios from "axios";
import * as querystring from "querystring";

/**
 * Storage service limited to only being able to fetch documents for a specific document
 */
export class DocumentDeltaStorageService implements IDocumentDeltaStorageService {
    constructor(
        private tenantId: string,
        private id: string,
        private token: string,
        private storageService: IDeltaStorageService) {
    }

    public get(from?: number, to?: number): Promise<ISequencedDocumentMessage[]> {
        return this.storageService.get(this.tenantId, this.id, this.token, from, to);
    }
}

/**
 * Provides access to the underlying delta storage on the server
 */
export class DeltaStorageService implements IDeltaStorageService {
    constructor(private url: string) {
    }

    public async get(
        tenantId: string,
        id: string,
        token: string,
        from?: number,
        to?: number): Promise<ISequencedDocumentMessage[]> {
        const query = querystring.stringify({ from, to });

        let headers = null;
        if (token) {
            headers = {
                Authorization: `Basic ${new Buffer(`${tenantId}:${token}`).toString("base64")}`,
            };
        }

        const result = await axios.get<ISequencedDocumentMessage[]>(
            `${this.url}/deltas/${tenantId}/${id}?${query}`, { headers });
        return result.data;
    }
}

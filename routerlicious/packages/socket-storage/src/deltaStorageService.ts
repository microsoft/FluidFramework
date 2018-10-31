// tslint:disable
import * as api from "@prague/runtime-definitions";
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
        const clientIds = new Set<string>();
        for (const data of result.data) {
            clientIds.add(data.clientId);
        }
        const contentPromises = [];
        for (const clientId of clientIds) {
            contentPromises.push(axios.get<api.ISequencedDocumentMessage[]>(
                `${this.url}/deltas/content/${encodeURIComponent(tenantId)}/${encodeURIComponent(id)}/${encodeURIComponent(clientId)}?${query}`, { headers }));
        }
        const contents = await Promise.all(contentPromises);
        const contentMap =  new Map<string, any>();
        for (const clientContent of contents) {
            if (clientContent.data.length > 0) {
                for (const content of clientContent.data) {
                    contentMap.set(`${content.clientId}-${content.op.clientSequenceNumber}`,content.op.contents);
                }
            }
        }
        const envelops = result.data;
        for (const envelope of envelops) {
            if (envelope.contents && envelope.contents !== null) {
                continue;
            }
            envelope.contents = contentMap.get(`${envelope.clientId}-${envelope.clientSequenceNumber}`);
        } 
        return envelops;
    }
}

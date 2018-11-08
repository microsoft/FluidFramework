// tslint:disable
import * as api from "@prague/runtime-definitions";
import * as assert from "assert";
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

        const opPromise = axios.get<api.ISequencedDocumentMessage[]>(
            `${this.url}/deltas/${encodeURIComponent(tenantId)}/${encodeURIComponent(id)}?${query}`, { headers });

        const contentPromise = axios.get<any[]>(
            `${this.url}/deltas/content/${encodeURIComponent(tenantId)}/${encodeURIComponent(id)}?${query}`, { headers });

        const [opData, contentData] = await Promise.all([opPromise, contentPromise]);

        const contents = contentData.data;
        const ops = opData.data;
        let contentIndex = 0;
        for (const op of ops) {
            if (op.clientId === null || op.type === "noop" || (op.contents && op.contents !== null)) {
                continue;
            }
            if (contentIndex === contents.length) {
                // TODO (mdaumi): We should fetch more contents starting from first missing sequence number.
                console.log(`Need to fetch more content from DB!`);
            } else {
                const content = contents[contentIndex];
                assert.equal(op.sequenceNumber, content.sequenceNumber, "Invalid delta content order");
                op.contents = content.op.contents;
                ++contentIndex;
            }

        }

        return ops;
    }
}

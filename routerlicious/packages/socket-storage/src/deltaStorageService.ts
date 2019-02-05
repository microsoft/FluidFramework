// tslint:disable
import * as api from "@prague/container-definitions";
import * as assert from "assert";
import axios from "axios";
import * as querystring from "querystring";
import { TokenProvider} from "./tokens";
/**
 * Storage service limited to only being able to fetch documents for a specific document
 */
export class DocumentDeltaStorageService implements api.IDocumentDeltaStorageService {
    constructor(
        private tenantId: string,
        private id: string,
        private tokenProvider: api.ITokenProvider,
        private storageService: api.IDeltaStorageService) {
    }

    /* tslint:disable:promise-function-async */
    public get(from?: number, to?: number): Promise<api.ISequencedDocumentMessage[]> {
        return this.storageService.get(this.tenantId, this.id, this.tokenProvider, from, to);
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
        tokenProvider: api.ITokenProvider,
        from?: number,
        to?: number): Promise<api.ISequencedDocumentMessage[]> {
        const query = querystring.stringify({ from, to });

        let headers = null;

        const token = (tokenProvider as TokenProvider).token;

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
            // Back-compat: Paparazzi to support old documents.
            if ((op.metadata && op.metadata.split)|| (op.contents === undefined)) {
                assert.ok(contentIndex < contents.length, "Delta content not found");
                const content = contents[contentIndex];
                assert.equal(op.sequenceNumber, content.sequenceNumber, "Invalid delta content order");
                if (op.metadata) {
                    op.metadata.split = false;
                }
                op.contents = content.op.contents;
                ++contentIndex;
            }
        }

        return ops;
    }
}

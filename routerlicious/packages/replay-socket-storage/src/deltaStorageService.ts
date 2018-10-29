import * as api from "@prague/runtime-definitions";
// tslint:disable-next-line:match-default-export-name
import axios from "axios";
import * as querystring from "querystring";

export class ReplayDeltaStorageService implements api.IDocumentDeltaStorageService {

    public get(from?: number, to?: number): Promise<api.ISequencedDocumentMessage[]> {
        return Promise.resolve([] as api.ISequencedDocumentMessage[]);
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

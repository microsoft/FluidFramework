import * as querystring from "querystring";
import * as request from "request";
import * as api from "../api-core";

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

    public get(
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

        return new Promise<api.ISequencedDocumentMessage[]>((resolve, reject) => {
            request.get(
                {
                    headers,
                    json: true,
                    url: `${this.url}/deltas/${tenantId}/${id}?${query}`,
                },
                (error, response, body) => {
                    if (error) {
                        reject(error);
                    } else if (response.statusCode !== 200) {
                        reject(response.statusCode);
                    } else {
                        resolve(body);
                    }
                });
        });
    }
}

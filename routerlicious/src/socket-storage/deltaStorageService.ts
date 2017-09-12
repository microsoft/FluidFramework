import * as querystring from "querystring";
import * as request from "request";
import * as api from "../api";

/**
 * Storage service limited to only being able to fetch documents for a specific document
 */
export class DocumentDeltaStorageService implements api.IDocumentDeltaStorageService {
    constructor(private id: string, private storageService: api.IDeltaStorageService) {
    }

    public get(from?: number, to?: number): Promise<api.ISequencedDocumentMessage[]> {
        return this.storageService.get(this.id, from, to);
    }
}

/**
 * Provides access to the underlying delta storage on the server
 */
export class DeltaStorageService implements api.IDeltaStorageService {
    constructor(private url: string) {
    }

    public get(id: string, from?: number, to?: number): Promise<api.ISequencedDocumentMessage[]> {
        const query = querystring.stringify({ from, to });

        return new Promise<api.ISequencedDocumentMessage[]>((resolve, reject) => {
            request.get(
                { url: `${this.url}/deltas/${id}?${query}`, json: true },
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

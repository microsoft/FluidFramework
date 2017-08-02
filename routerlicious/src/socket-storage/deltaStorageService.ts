import * as querystring from "querystring";
import * as request from "request";
import * as api from "../api";

/**
 * Storage service limited to only being able to fetch documents for a specific document
 */
export class DocumentDeltaStorageService implements api.IDeltaStorageService {
    constructor(private id: string, private storageService: DeltaStorageService) {
    }

    public get(from?: number, to?: number): Promise<api.ISequencedMessage[]> {
        return this.storageService.get(this.id, from, to);
    }
}

/**
 * Provides access to the underlying delta storage on the server
 */
export class DeltaStorageService {
    constructor(private url: string) {
    }

    public get(id: string, from?: number, to?: number): Promise<api.ISequencedMessage[]> {
        const query = querystring.stringify({ from, to });

        return new Promise<api.ISequencedMessage[]>((resolve, reject) => {
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

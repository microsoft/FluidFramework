import * as querystring from "querystring";
import * as request from "request";
import * as api from "../api";

/**
 * Provides access to the underlying delta storage
 */
export class DeltaStorageService implements api.IDeltaStorageService {
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
                    } else {
                        resolve(body);
                    }
                });
        });
    }
}

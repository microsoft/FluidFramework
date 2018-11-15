import * as api from "@prague/runtime-definitions";
import Axios, { AxiosInstance } from "axios";
import * as querystring from "querystring";
import { IDeltaStorageGetResponse, ISequencedDeltaOpMessage } from "./contracts";
import { TokenProvider } from "./token";

/**
 * Storage service limited to only being able to fetch documents for a specific document
 */
export class DocumentDeltaStorageService implements api.IDocumentDeltaStorageService {
    constructor(
        private readonly tenantId: string,
        private readonly id: string,
        private readonly tokenProvider: api.ITokenProvider,
        private readonly storageService: api.IDeltaStorageService) {
    }

    /* tslint:disable:promise-function-async */
    public get(from?: number, to?: number): Promise<api.ISequencedDocumentMessage[]> {
        return this.storageService.get(this.tenantId, this.id, this.tokenProvider, from, to);
    }
}

/**
 * Provides access to delta storage
 */
export class DeltaStorageService implements api.IDeltaStorageService {

    constructor(private readonly deltaFeedUrl: string, private readonly axiosInstance: AxiosInstance = Axios) {
    }

    /**
     * Retrieves all the delta operations within the inclusive sequence number range
     */
    public async get(
        tenantId: string,
        id: string,
        tokenProvider: api.ITokenProvider,
        from?: number,
        to?: number): Promise<api.ISequencedDocumentMessage[]> {
        const url = this.buildUrl(from, to);

        let headers;

        const token = (tokenProvider as TokenProvider).storageToken;
        if (token && token.length > 0) {
            headers = {
                Authorization: `Bearer ${token}`,
            };
        }

        const result = await this.axiosInstance.get<IDeltaStorageGetResponse>(url, { headers });
        if (result.status !== 200) {
            throw new Error(`Invalid opStream response status "${result.status}".`);
        }

        const operations = result.data.value;
        if (operations.length > 0 && "op" in operations[0]) {
            return (operations as ISequencedDeltaOpMessage[]).map((operation) => operation.op);
        }

        return operations as api.ISequencedDocumentMessage[];
    }

    public buildUrl(from?: number, to?: number) {
        const query = querystring.stringify({ filter: `sequenceNumber ge ${from} and sequenceNumber le ${to}` });

        return `${this.deltaFeedUrl}?$${query}`;
    }
}

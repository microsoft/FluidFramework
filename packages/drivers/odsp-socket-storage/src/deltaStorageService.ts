import * as api from "@prague/container-definitions";
import Axios, { AxiosInstance } from "axios";
import * as querystring from "querystring";
import { IDeltaStorageGetResponse, ISequencedDeltaOpMessage } from "./contracts";
import { debug } from "./debug";
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
        tenantId: string | null,
        id: string | null,
        tokenProvider: api.ITokenProvider,
        from?: number,
        to?: number): Promise<api.ISequencedDocumentMessage[]> {
        const myTokenProvider = tokenProvider as TokenProvider;

        const url = this.buildUrl(from, to, myTokenProvider);

        const headers = myTokenProvider.getStorageHeaders();

        const result = await this.axiosInstance.get<IDeltaStorageGetResponse>(url, { headers });
        if (result.status !== 200) {
            debug(`Invalid opStream response status "${result.status} ".`);
            throw new Error(`Invalid opStream response status "${result.status}".`);
        }

        const operations = result.data.value;
        if (operations.length > 0 && "op" in operations[0]) {
            return (operations as ISequencedDeltaOpMessage[]).map((operation) => operation.op);
        }

        return operations as api.ISequencedDocumentMessage[];
    }

    public buildUrl(from?: number, to?: number, tokenProvider?: TokenProvider) {
        const fromInclusive = from === undefined ? undefined : from + 1;
        const toInclusive = to === undefined ? undefined : to - 1;

        const queryParams = {
            filter: `sequenceNumber ge ${fromInclusive} and sequenceNumber le ${toInclusive}`,
            ...(tokenProvider ? tokenProvider.getStorageQueryParams() : {}),
        };

        const query = querystring.stringify(queryParams);

        return `${this.deltaFeedUrl}?${query}`;
    }
}

import * as api from "@prague/runtime-definitions";
import Axios, { AxiosInstance } from "axios";
import * as querystring from "querystring";
import { IDeltaFeedResponse, ISequencedDocumentOp } from "./sharepointContracts";
import { TokenProvider } from "./token";

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
 * Provides access to the sharepoint delta storage
 */
export class SharepointDeltaStorageService implements api.IDeltaStorageService {

    public constructor(
        private readonly deltaFeedUrl: string,
        private readonly axiosInstance: AxiosInstance = Axios) {
    }

    public async get(
        tenantId: string,
        id: string,
        tokenProvider: api.ITokenProvider,
        from?: number,
        to?: number): Promise<api.ISequencedDocumentMessage[]> {
        const requestUrl = this.constructUrl(from, to);
        let headers = null;

        const token = (tokenProvider as TokenProvider).deltaStorageToken;
        if (token) {
            headers = {
                Authorization: `Bearer ${new Buffer(`${token}`)}`,
            };
        }
        const result = await this.axiosInstance.get<IDeltaFeedResponse>(requestUrl, { headers });
        const ops = result.data.value;
        const sequencedMsgs: api.ISequencedDocumentMessage[] = [];

        // TODO: Having to copy the "op" property on each element of the array is undesirable.
        // SPO is looking into updating this layer of the envelope to match routerlicious
        // The logic below takes care of n/n-1 when that change happens
        if (ops.length > 0 && "op" in ops[0]) {
            (ops as ISequencedDocumentOp[]).forEach((op) => {
                sequencedMsgs.push(op.op);
            });
            return sequencedMsgs;
        } else {
            return ops as api.ISequencedDocumentMessage[];
        }
    }

    public constructUrl(
        from?: number,
        to?: number): string {
        let deltaFeedUrl: string;
        const queryFilter = `sequenceNumber ge ${from} and sequenceNumber le ${to}`;
        const query = querystring.stringify({ filter: queryFilter });
        deltaFeedUrl = `${this.deltaFeedUrl}?$${query}`;

        return deltaFeedUrl;
    }
}

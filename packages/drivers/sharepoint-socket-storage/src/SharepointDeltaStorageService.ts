import * as api from "@prague/container-definitions";
import { ISequencedDeltaOpMessage } from "./contracts";
import { DeltaStorageService as StandardDeltaStorageService } from "./deltaStorageService";
import { getQueryString } from "./getQueryString";
import { IGetter } from "./Getter";
import { TokenProvider } from "./token";
import { getWithRetryForTokenRefresh } from "./utils";

interface IDeltasResponse {
    value: api.ISequencedDocumentMessage[];
}

export class SharepointDeltaStorageService implements api.IDeltaStorageService {
    private firstGetRequest = true;
    private readonly standardDeltaStorage: api.IDeltaStorageService;
    private readonly queryString: string;

    constructor(
        queryParams: { [key: string]: string },
        private readonly deltaFeedUrl: string,
        private readonly getter: IGetter | undefined,
        private ops: ISequencedDeltaOpMessage[] | undefined,
        private readonly getToken: (refresh: boolean) => Promise<string>,
    ) {
        this.standardDeltaStorage = new StandardDeltaStorageService(this.deltaFeedUrl);
        this.queryString = getQueryString(queryParams);
    }

    public async get(
        tenantId: string,
        id: string,
        tokenProvider: api.ITokenProvider,
        from?: number,
        to?: number,
    ): Promise<api.ISequencedDocumentMessage[]> {
        if (this.firstGetRequest) {
            this.firstGetRequest = false;
            if (this.ops !== undefined && this.ops !== null && from) {
                const returnOps = this.ops;
                this.ops = undefined;

                // If cache is empty, it's much better to allow actual request to go through.
                // This request is asynchronous from POV of Container load sequence (when we start with snapshot)
                // But if we have a gap, we figure it out later in time (when websocket connects and we receive initial ops / first op),
                // and we will have to wait for actual data to come in - it's better to make this call earlier in time!
                if (returnOps.length > 0) {
                    return returnOps.filter((op) => op.sequenceNumber > from).map((op) => op.op);
                }
            }
        }

        let token: string;
        if (this.getter) {
            return getWithRetryForTokenRefresh(async (refresh: boolean) => {
                token = await this.getToken(refresh);
                const url = this.buildUrl(token, from, to);
                return this.getter!.get<IDeltasResponse>(url, url, {}).then((response) => {
                    const operations = response.value;
                    if (operations.length > 0 && "op" in operations[0]) {
                        return ((operations as any) as ISequencedDeltaOpMessage[]).map((operation) => operation.op);
                    }

                    return operations as api.ISequencedDocumentMessage[];
                });
            });
        }

        token = await this.getToken(false);
        return this.standardDeltaStorage.get(tenantId, id, new TokenProvider(token, ""), from, to);
    }

    private buildUrl(token: string, from: number | undefined, to: number | undefined) {
        const fromInclusive = from === undefined ? undefined : from + 1;
        const toInclusive = to === undefined ? undefined : to - 1;

        const filter = encodeURIComponent(`sequenceNumber ge ${fromInclusive} and sequenceNumber le ${toInclusive}`);
        const fullQueryString =
            `${(this.queryString ? `${this.queryString}&` : "?")}filter=${filter}&access_token=${token}`;
        return `${this.deltaFeedUrl}${fullQueryString}`;
    }
}

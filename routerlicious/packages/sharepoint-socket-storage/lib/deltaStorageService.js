var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// tslint:disable-next-line:match-default-export-name
import axios from "axios";
import * as querystring from "querystring";
/**
 * Storage service limited to only being able to fetch documents for a specific document
 */
export class DocumentDeltaStorageService {
    constructor(tenantId, id, token, storageService) {
        this.tenantId = tenantId;
        this.id = id;
        this.token = token;
        this.storageService = storageService;
    }
    /* tslint:disable:promise-function-async */
    get(from, to) {
        return this.storageService.get(this.tenantId, this.id, this.token, from, to);
    }
}
/**
 * Provides access to the sharepoint delta storage
 */
export class SharepointDeltaStorageService {
    constructor(deltaFeedUrl) {
        this.deltaFeedUrl = deltaFeedUrl;
    }
    get(tenantId, id, token, from, to) {
        return __awaiter(this, void 0, void 0, function* () {
            const requestUrl = this.constructUrl(from, to);
            let headers = null;
            if (token) {
                headers = {
                    Authorization: `Bearer ${new Buffer(`${token}`)}`,
                };
            }
            const result = yield axios.get(requestUrl, { headers });
            const ops = result.data.value;
            const sequencedMsgs = [];
            // TODO: Having to copy the "op" property on each element of the array is undesirable.
            // SPO is looking into updating this layer of the envelope to match routerlicious
            // The logic below takes care of n/n-1 when that change happens
            if (ops.length > 0 && "op" in ops[0]) {
                ops.forEach((op) => {
                    sequencedMsgs.push(op.op);
                });
                return sequencedMsgs;
            }
            else {
                return ops;
            }
        });
    }
    constructUrl(from, to) {
        let deltaFeedUrl;
        const queryFilter = `sequenceNumber ge ${from} and sequenceNumber le ${to}`;
        const query = querystring.stringify({ filter: queryFilter });
        deltaFeedUrl = `${this.deltaFeedUrl}?$${query}`;
        return deltaFeedUrl;
    }
}
//# sourceMappingURL=deltaStorageService.js.map
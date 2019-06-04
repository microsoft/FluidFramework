import * as api from "@prague/container-definitions";
import * as fs from "fs";

/**
 * Provides access to the underlying delta storage on the local file storage for file driver.
 */
export class FileDeltaStorageService implements api.IDocumentDeltaStorageService {

    private messages: api.ISequencedDocumentMessage[];
    private isGetCalledFirstTime = true;
    constructor(private path: string) {
        const data = fs.readFileSync(`${this.path}//messages.json`);
        this.messages = JSON.parse(data.toString("utf-8"));
    }

    public async get(
        from?: number,
        to?: number,
    ): Promise<api.ISequencedDocumentMessage[]> {
        if (this.isGetCalledFirstTime === true) {
            this.isGetCalledFirstTime = false;
            return this.getCore(false, from, to);
        } else {
            return this.getCore(true, from, to - 1);
        }
    }

    /**
     * Retrieve ops within the exclusive sequence number range.
     *
     * @param from - First op to be fetched.
     * @param to - Last op to be fetched. This is exclusive.
     */
    public async getFromWebSocket(
        from?: number,
        to?: number,
    ): Promise<api.ISequencedDocumentMessage[]> {
        return this.getCore(true, from, to);
    }

    private async getCore(
        isFromWebSocket: boolean,
        from?: number,
        to?: number,
    ): Promise<api.ISequencedDocumentMessage[]> {
        const requestedMessages: api.ISequencedDocumentMessage[] = [];
        if (from === undefined || to === undefined || isFromWebSocket === false) {
            return requestedMessages;
        }
        const readFrom = from ? Math.min(from, this.messages.length - 1) : 0;
        const readTo = to ? Math.min(to, this.messages.length) : this.messages.length;
        this.messages.slice(readFrom, readTo).forEach((element) => {
            requestedMessages.push(element);
        });

        return requestedMessages;
    }
}

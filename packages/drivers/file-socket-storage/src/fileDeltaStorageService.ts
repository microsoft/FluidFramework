import * as api from "@prague/container-definitions";
import * as fs from "fs";

export class FileDeltaStorageService implements api.IDocumentDeltaStorageService {

    private messages: api.ISequencedDocumentMessage[];
    constructor(private fileName: string) {
        const data = fs.readFileSync(this.fileName);
        this.messages = JSON.parse(data.toString("utf-8"));
    }

    public async get(
        from?: number,
        to?: number): Promise<api.ISequencedDocumentMessage[]> {
            const requestedMessages: api.ISequencedDocumentMessage[] = [];
            const readFrom = from ? Math.min(from, this.messages.length - 1) : 0;
            const readTo = to ? Math.min(to, this.messages.length) : this.messages.length;
            this.messages.slice(readFrom, readTo).forEach((element) => {
                requestedMessages.push(element);
            });
            console.log("Number of messages requested: ", requestedMessages.length, " ", from, " ", to);
            return requestedMessages;
    }
}

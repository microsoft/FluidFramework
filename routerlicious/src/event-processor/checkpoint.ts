import { StartOfStream } from ".";

export class Checkpoint {
    constructor(public partitionId: string, public offset: string = StartOfStream, public sequenceNumber: number = 0) {
    }
}

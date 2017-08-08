import * as assert from "assert";
import { EventEmitter } from "events";
import { debug } from "./debug";
import { Document, IDeltaConnection } from "./document";
import { IObjectMessage, ISequencedObjectMessage } from "./protocol";

interface IRange {
    primary: number;
    secondary: number;
    length: number;
}

/**
 * Helper class that keeps track of the mapping between sequence number ranges.
 * The secondary range is assumed to increase monotonically between calls.
 *
 * I should have this thing hand out tickets as well
 */
class RangeTracker {
    private ranges: IRange[] = [];

    constructor(primary: number, private secondary: number) {
        this.ranges.push({
            length: 1,
            primary,
            secondary,
        });
    }

    public updateBase(primary: number) {
        assert(primary > this.ranges[0].primary);

        // Walk the ranges looking for the first one that is greater than the primary. Primary is then within the
        // previous index by definition (since it's less than the current index's primary but greather than the
        // previous index's primary) and we know primary must be greater than the base.
        let index = 1;
        for (; index < this.ranges.length; index++) {
            if (primary < this.ranges[index].primary) {
                break;
            }
        }
        assert(primary >= this.ranges[index - 1].primary);

        // Update the last range
        const range = this.ranges[index - 1];
        range.length = Math.min(primary - range.primary, 1);
        range.primary = primary;

        // And remove unnecessary ranges
        this.ranges = this.ranges.slice(index - 1);
    }

    public ticket(primary: number): number {
        // Pre-increment secondary to get the next sequence number
        const secondary = ++this.secondary;
        const tail = this.ranges[this.ranges.length - 1];

        // See if we can simply extend the length of the tail
        if (tail.primary + tail.length === primary) {
            tail.length++;
        } else {
            this.ranges.push({ length: 1, primary, secondary });
        }

        return secondary;
    }

    public getClosest(primary: number) {
        assert(primary >= this.ranges[0].primary);

        // Find the first range where the starting position is greater than the primary. Our target range is
        // the one before it.
        let index = 1;
        for (; index < this.ranges.length; index++) {
            if (primary < this.ranges[index].primary) {
                break;
            }
        }
        assert(primary >= this.ranges[index - 1].primary);

        // If the difference is within the stored range use it - otherwise add in the length - 1 as the highest
        // stored secondary value to use.
        const closestRange = this.ranges[index - 1];
        return Math.min(primary - closestRange.primary, closestRange.length - 1) + closestRange.secondary;
    }
}

export class DeltaConnection implements IDeltaConnection {
    protected events = new EventEmitter();

    private map: RangeTracker;

    private minSequenceNumber;

    public get minimumSequenceNumber(): number {
        return this.minSequenceNumber;
    }

    constructor(
        public objectId: string,
        private document: Document,
        sequenceNumber,
        documentSequenceNumber: number) {

        this.minSequenceNumber = sequenceNumber;
        this.map = new RangeTracker(documentSequenceNumber, sequenceNumber);
    }

    public on(event: string, listener: (...args: any[]) => void): this {
        this.events.on(event, listener);
        return this;
    }

    public emit(
        message: IObjectMessage,
        clientId: string,
        documentMinimumSequenceNumber: number,
        documentSequenceNumber: number) {

        this.minSequenceNumber = this.map.getClosest(documentMinimumSequenceNumber);
        debug(this.objectId, `${documentMinimumSequenceNumber} msn maps to local ${this.minSequenceNumber}`);
        const sequenceNumber = this.map.ticket(documentSequenceNumber);
        debug(this.objectId, `${documentSequenceNumber} maps to assigned ${sequenceNumber}`);
        const sequencedObjectMessage: ISequencedObjectMessage = {
            clientId,
            clientSequenceNumber: message.clientSequenceNumber,
            contents: message.contents,
            minimumSequenceNumber: this.minSequenceNumber,
            referenceSequenceNumber: message.referenceSequenceNumber,
            sequenceNumber,
            type: message.type,
        };

        this.events.emit("op", sequencedObjectMessage);
    }

    public updateMinSequenceNumber(value: number) {
        this.map.updateBase(value);
        const newMinSequenceNumber = this.map.getClosest(value);

        // Notify clients when then number changed
        if (newMinSequenceNumber !== this.minimumSequenceNumber) {
            this.minSequenceNumber = newMinSequenceNumber;
            debug(this.objectId, `MSN update of ${value} maps to ${this.minSequenceNumber}`);
            this.events.emit("minSequenceNumber", this.minSequenceNumber);
        }
    }

    /**
     * Send new messages to the server
     */
    public submit(message: IObjectMessage): this {
        this.document.submitObjectMessage({ address: this.objectId, contents: message });

        return this;
    }
}

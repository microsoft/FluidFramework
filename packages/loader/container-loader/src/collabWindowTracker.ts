/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, Timer } from "@fluidframework/common-utils";
import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import { isRuntimeMessage, MessageType2 } from "@fluidframework/driver-utils";

const defaultNoopTimeFrequency = 2000;
const defaultNoopCountFrequency = 50;

// Here are key considerations when deciding conditions for when to send non-immediate noops:
// 1. Sending them too often results in increase in file size and bandwidth, as well as catch up performance
// 2. Sending too infrequently ensures that collab window is large, and as result Sequence DDS would have
//    large catchUp blobs - see Issue #6364
// 3. Similarly, processes that rely on "core" snapshot (and can't parse trailing ops, including above), like search
//    parser in SPO, will result in non-accurate results due to presence of catch up blobs.
// 4. Ordering service used 250ms timeout to coalesce non-immediate noops. It was changed to 2000 ms to allow more
//    aggressive noop sending from client side.
// 5. Number of ops sent by all clients is proportional to number of "write" clients (every client sends noops),
//    but number of sequenced noops is a function of time (one op per 2 seconds at most).
//    We should consider impact to both outbound traffic (might be huge, depends on number of clients) and file size.
// Please also see Issue #5629 for more discussions.
//
// With that, the current algorithm is as follows:
// 1. Sent noop 2000 ms of receiving an op if no ops were sent by this client within this timeframe.
//    This will ensure that MSN moves forward with reasonable speed. If that results in too many sequenced noops,
//    server timeout of 2000ms should be reconsidered to be increased.
// 2. If there are more than 50 ops received without sending any ops, send noop to keep collab window small.
//    Note that system ops (including noops themselves) are excluded, so it's 1 noop per 50 real ops.
export class CollabWindowTracker {
    private opsCountSinceNoop = 0;
    private readonly timer: Timer | undefined;

    constructor(
        private readonly submit: (type: MessageType) => void,
        NoopTimeFrequency: number = defaultNoopTimeFrequency,
        private readonly NoopCountFrequency: number = defaultNoopCountFrequency,
    ) {
        if (NoopTimeFrequency !== Infinity) {
            this.timer = new Timer(NoopTimeFrequency, () => {
                // Can get here due to this.stopSequenceNumberUpdate() not resetting timer.
                // Also timer callback can fire even after timer cancellation if it was queued before cancellation.
                if (this.opsCountSinceNoop !== 0) {
                    this.submitNoop(false /* immediate */);
                }
            });
        }
    }

    /**
     * Schedules as ack to the server to update the reference sequence number
     */
    public scheduleSequenceNumberUpdate(message: ISequencedDocumentMessage, immediateNoOp: boolean): void {
        // While processing a message, an immediate no-op can be requested.
        // i.e. to expedite approve or commit phase of quorum.
        if (immediateNoOp) {
            this.submitNoop(true /* immediate */);
            return;
        }

        // We don't acknowledge no-ops to avoid acknowledgement cycles (i.e. ack the MSN
        // update, which updates the MSN, then ack the update, etc...).
        // Intent here is for runtime (and DDSes) not to keep too much tracking state / memory
        // due to runtime ops from other clients.
        if (!isRuntimeMessage(message)) {
            return;
        }

        this.opsCountSinceNoop++;
        if (this.opsCountSinceNoop === this.NoopCountFrequency) {
            // Ensure we only send noop after a batch of many ops is processed
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            Promise.resolve().then(() => {
                assert(this.opsCountSinceNoop >= this.NoopCountFrequency,
                    0x3ae /* not enough ops were sent to reach the noop frequency */);
                this.submitNoop(false /* immediate */);
                // reset count now that all ops are processed
                this.opsCountSinceNoop = 0;
                return;
            });
        }

        if (this.timer !== undefined) {
            if (this.opsCountSinceNoop === 1) {
                this.timer.restart();
            }

            assert(this.timer.hasTimer, 0x242 /* "has timer" */);
        }
    }

    private submitNoop(immediate: boolean) {
        // Anything other than null is immediate noop
        // ADO:1385: Remove cast and use MessageType once definition changes propagate
        this.submit(immediate ? (MessageType2.Accept as unknown as MessageType) : MessageType.NoOp);
        assert(this.opsCountSinceNoop === 0,
            0x243 /* "stopSequenceNumberUpdate should be called as result of sending any op!" */);
    }

    public stopSequenceNumberUpdate(): void {
        this.opsCountSinceNoop = 0;
        // Ideally, we cancel timer here. But that will result in too often set/reset cycle if this client
        // keeps sending ops. In most cases it's actually better to let it expire (at most - 4 times per second)
        // for nothing, then have a ton of set/reset cycles.
        // Note that Timer.restart() is smart and will not change timer expiration if we keep extending timer
        // expiration - it will restart the timer instead when it fires with adjusted expiration.
        // this.timer.clear();
    }
}

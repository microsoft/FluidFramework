/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { EventEmitter } from "events";
import { Deferred } from "@microsoft/fluid-core-utils";
import { ICheckpointOffset, IContext  } from "@microsoft/fluid-server-services-core";

interface IWaitOffset {
    deferred: Deferred<void>;
    value: number;
}

export class TestContext extends EventEmitter implements IContext {
    public offset: number = Number.NEGATIVE_INFINITY;
    private waits: IWaitOffset[] = [];

    public checkpoint(checkpointOffset: ICheckpointOffset) {
        assert(checkpointOffset.offset > this.offset, `${checkpointOffset.offset} > ${this.offset}`);
        this.offset = checkpointOffset.offset;

        // Use filter to update the waiting array and also trigger the callback for those that are filtered out
        this.waits = this.waits.filter((wait) => {
            if (wait.value <= checkpointOffset.offset) {
                wait.deferred.resolve();
                return false;
            } else {
                return true;
            }
        });
    }

    public error(error: any, restart: boolean) {
        this.emit("error", error, restart);
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public waitForOffset(value: number): Promise<void> {
        if (value <= this.offset) {
            return Promise.resolve();
        }

        const deferred = new Deferred<void>();
        this.waits.push({ deferred, value });
        return deferred.promise;
    }
}

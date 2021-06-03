/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { EventEmitter } from "events";
import { Deferred } from "@fluidframework/common-utils";
import { IContext, IQueuedMessage, ILogger, IContextErrorData } from "@fluidframework/server-services-core";
import { DebugLogger } from "./logger";

interface IWaitOffset {
    deferred: Deferred<void>;
    value: number;
}

export class TestContext extends EventEmitter implements IContext {
    public offset: number = -1;
    private waits: IWaitOffset[] = [];

    constructor(public readonly log: ILogger = DebugLogger.create("fluid-server:TestContext")) {
        super();
    }

    public checkpoint(queuedMessage: IQueuedMessage) {
        assert(queuedMessage.offset > this.offset, `${queuedMessage.offset} > ${this.offset}`);
        this.offset = queuedMessage.offset;

        // Use filter to update the waiting array and also trigger the callback for those that are filtered out
        this.waits = this.waits.filter((wait) => {
            if (wait.value <= queuedMessage.offset) {
                wait.deferred.resolve();
                return false;
            } else {
                return true;
            }
        });
    }

    public error(error: any, errorData: IContextErrorData) {
        this.emit("error", error, errorData);
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

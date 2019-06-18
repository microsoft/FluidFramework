/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContext } from "@prague/services-core";
import * as utils from "@prague/utils";
import * as assert from "assert";
import { EventEmitter } from "events";

interface IWaitOffset {
    deferred: utils.Deferred<void>;
    value: number;
}

export class TestContext extends EventEmitter implements IContext {
    public offset: number = Number.NEGATIVE_INFINITY;
    private waits = new Array<IWaitOffset>();

    public checkpoint(offset: number) {
        assert(offset > this.offset, `${offset} > ${this.offset}`);
        this.offset = offset;

        // Use filter to update the waiting array and also trigger the callback for those that are filtered out
        this.waits = this.waits.filter((wait) => {
            if (wait.value <= offset) {
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

    public waitForOffset(value: number): Promise<void> {
        if (value <= this.offset) {
            return Promise.resolve();
        }

        const deferred = new utils.Deferred<void>();
        this.waits.push({ deferred, value });
        return deferred.promise;
    }
}

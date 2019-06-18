/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Context as FnContext } from "@azure/functions";
import { IContext } from "@prague/services-core";
import { Deferred } from "@prague/utils";

export class Context implements IContext {
    private deferred = new Deferred<void>();
    private pending = new Array<{ target: number, deferred: Deferred<void> }>();
    private offset = 0;

    constructor(private fnContext: FnContext) {
    }

    public updateContext(newContext: FnContext) {
        this.fnContext = newContext;
    }

    public checkpoint(offset: number) {
        this.fnContext.log(`checkpoint(${offset})`);
        this.offset = offset;

        this.pending.forEach((value) => {
            if (value.target <= offset) {
                value.deferred.resolve();
            }
        });

        this.pending = this.pending.filter((value) => value.target > offset);
    }

    public wait(target: number): Promise<void> {
        if (this.offset >= target) {
            this.fnContext.log(`${this.offset} >= ${target}`);
            return Promise.resolve();
        } else {
            this.fnContext.log(`${this.offset} < ${target}`);
            const pendingData = { target, deferred: new Deferred<void>() };
            this.pending.push(pendingData);
            return pendingData.deferred.promise;
        }
    }
    
    public error(error: any, restart: boolean) {
        throw new Error("Method not implemented.");
    }
}

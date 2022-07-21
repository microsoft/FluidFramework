/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { logStatus } from "./logging";

export class Timer {
    private lastTime: number = Date.now();
    private totalTime: number = 0;

    constructor(private enabled: boolean) {

    }
    public time(msg?: string, print?: boolean) {
        const currTime = Date.now();
        const diffTime = currTime - this.lastTime;
        this.lastTime = currTime;
        const diffTimeInSeconds = diffTime / 1000;
        if (msg) {
            if (this.enabled) {
                if (diffTime > 100) {
                    logStatus(`${msg} - ${diffTimeInSeconds.toFixed(3)}s`);
                } else {
                    logStatus(`${msg} - ${diffTime}ms`);
                }
            } else if (print) {
                logStatus(msg);
            }
        }
        this.totalTime += diffTime;
        return diffTimeInSeconds;
    }

    public getTotalTime() {
        return this.totalTime;
    }
}
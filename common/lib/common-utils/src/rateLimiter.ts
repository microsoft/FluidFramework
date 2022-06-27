/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A rate limiter to make sure that a client can only request help for one task within a time window.
 */
export class RateLimiter {
    private readonly requestMap = new Map<string, number>();

    /**
     * Creates a rate limiter that keep track of the request it has made
     *
     * @param windowMSec - time in millisecond, use to filter out messages
     * for a clientId if the last request falls within this time window
     */
    constructor(private readonly windowMSec: number) {

    }

    /**
     * Filter out the messages that had already been requested within the time window
     *
     * @param clientId - the clientId who want to send the message
     * @param messages - the message we want to send
     * @returns the message we approved to send that hasn't been sent recently
     */
    public filter(clientId: string, messages: string[]): string[] {
        const approvedList: string[] = [];
        const currentTime = Date.now();

        for (const message of messages) {
            const key = `${clientId}/${message}`;
            if (!this.requestMap.has(key)) {
                this.requestMap.set(key, currentTime);
                approvedList.push(message);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            } else if (this.requestMap.get(key)! + this.windowMSec > currentTime) {
                continue;
            } else {
                this.requestMap.set(key, currentTime);
                approvedList.push(message);
            }
        }

        return approvedList;
    }
}

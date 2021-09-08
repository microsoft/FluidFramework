/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import { ISharedMap } from "@fluidframework/map";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import * as Sequence from "@fluidframework/sequence";
import { IIntelligentService } from "./analytics";
import { RateLimiter } from "./rateLimiter";

// 10s wait time between intelligent service calls
const defaultWaitTime = 10 * 1000;

export class IntelligentServicesManager {
    private readonly services: IIntelligentService[] = [];
    private rateLimiter: RateLimiter | undefined;
    private intelInvoked: boolean = false;

    constructor(private readonly sharedString: Sequence.SharedString, private readonly documentInsights: ISharedMap) { }

    /**
     * Registers a new intelligent service
     */
    public registerService(service: IIntelligentService) {
        this.services.push(service);
    }

    public process() {
        this.sharedString.on("op", (msg: ISequencedDocumentMessage) => {
            if (!this.intelInvoked) {
                // And then run plugin insights rate limited
                this.rateLimiter = new RateLimiter(
                    async () => {
                        const handle = this.documentInsights.get<IFluidHandle<ISharedMap>>(this.sharedString.id);
                        if (!handle) { return; }
                        const output = await handle.get();

                        // Run the shared services
                        const text = this.sharedString.getText();
                        const setInsightsP = this.services.map(async (service) => {
                            const result = await service.run(text);
                            return output.set(service.name, result);
                        });
                        return Promise.all(setInsightsP);
                    },
                    defaultWaitTime);
                this.intelInvoked = true;
            }
            if (this.rateLimiter) {
                this.rateLimiter.trigger();
            }
        });
    }

    public stop() {
        if (this.rateLimiter) {
            this.rateLimiter.stop();
        }
        this.sharedString.removeAllListeners();
    }
}

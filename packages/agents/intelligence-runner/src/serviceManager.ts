/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { ISharedMap } from "@microsoft/fluid-map";
import { ISequencedDocumentMessage } from "@microsoft/fluid-protocol-definitions";
import * as Sequence from "@microsoft/fluid-sequence";
import { IIntelligentService } from "./analytics";
import { RateLimiter } from "./rateLimiter";

// 10s wait time between intelligent service calls
const defaultWaitTime = 10 * 1000;

export class IntelligentServicesManager {
    private readonly services: IIntelligentService[] = [];
    private rateLimiter: RateLimiter | undefined;
    private intelInvoked: boolean = false;

    constructor(private readonly sharedString: Sequence.SharedString, private readonly documentInsights: ISharedMap) {}

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
                        const output = await this.documentInsights
                            .get<IComponentHandle<ISharedMap>>(this.sharedString.id)
                            .get();

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
}

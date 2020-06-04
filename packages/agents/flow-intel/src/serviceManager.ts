/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { FlowDocument } from "@fluid-example/webflow";
import { ISharedMap } from "@fluidframework/map";
import { IIntelligentService } from "./analytics";
import { RateLimiter } from "./rateLimiter";

interface IMatch {
    length: number;
    offset: number;
    text: string;
}

interface IEntity {
    name: string;
    matches: IMatch[];
    type: string;
}

// 10s wait time between intelligent service calls
const defaultWaitTime = 10 * 1000;

export class IntelligentServicesManager {
    private readonly services: IIntelligentService[] = [];
    private rateLimiter: RateLimiter | undefined;
    private intelInvoked: boolean = false;

    constructor(private readonly document: FlowDocument, private readonly documentInsights: ISharedMap) { }

    /**
     * Registers a new intelligent service
     */
    public registerService(service: IIntelligentService) {
        this.services.push(service);
    }

    public stop() {
        if (this.rateLimiter) {
            this.rateLimiter.stop();
        }
        this.document.removeAllListeners();
    }

    public process() {
        this.document.on("sequenceDelta", () => {
            if (!this.intelInvoked) {
                // And then run plugin insights rate limited
                this.rateLimiter = new RateLimiter(
                    async () => {
                        // Run the shared services
                        const text = this.document.getText();
                        const setInsightsP = this.services.map(async (service) => {
                            const result = await service.run(text);
                            if (result.entities) {
                                this.processEntities(result);
                            }
                            return this.documentInsights.set(service.name, result);
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

    private processEntities(result: any) {
        const entities = result.entities as IEntity[];
        for (const entity of entities) {
            if (entity.matches.length > 0) {
                const match = entity.matches[0];
                if (match.offset >= 0 && match.length > 0) {
                    const start = match.offset;
                    const end = start + match.length;
                    const parsedText = this.document.getText(start, end);
                    if (match.text === parsedText) {
                        let classType: string = "";
                        if (entity.type === "Other") {
                            classType = "entity-generic";
                        } else if (entity.type === "Location") {
                            classType = "entity-location";
                        } else if (entity.type === "Person") {
                            classType = "entity-person";
                        }
                        // Disable style change temporarily.
                        if (classType !== "") {
                            // this.document.addCssClass(start, end, classType);
                        }
                    }
                }
            }
        }
    }
}

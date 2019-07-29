/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { FlowDocument } from "@chaincode/webflow";
import { ISharedMap } from "@prague/map";
import { resumeAnalytics, textAnalytics } from "./analytics" ;
import { IntelligentServicesManager } from "./serviceManager";

const resumeAnalyticsConfig = {
    deviceId: "routerlicious",
    host: "",
    sharedAccessKey: "",
    sharedAccessKeyName: "",
    url: "",
};

export class IntelRunner {
    private intelligenceManager: IntelligentServicesManager | undefined;

    constructor(
        private readonly document: FlowDocument,
        private readonly insightsMap: ISharedMap,
        private readonly apiKey: string) {
    }

    public async start(): Promise<void> {
        const textAnalyticsConfig = {
            key: this.apiKey,
        };
        this.intelligenceManager = new IntelligentServicesManager(this.document, this.insightsMap);
        this.intelligenceManager.registerService(textAnalytics.factory.create(textAnalyticsConfig));
        this.intelligenceManager.registerService(resumeAnalytics.factory.create(resumeAnalyticsConfig));
        this.intelligenceManager.process();
    }
}

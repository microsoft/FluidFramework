/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { FlowDocument } from "@chaincode/webflow";
import { ISharedMap } from "@prague/map";
import { resumeAnalytics, textAnalytics } from "./analytics" ;
import { IntelligentServicesManager } from "./serviceManager";

const textAnalyticsConfig = {
    key: "c8b60dc5e49849ce903d7d29a2dce550",
};

const resumeAnalyticsConfig = {
    deviceId: "routerlicious",
    host: "",
    sharedAccessKey: "",
    sharedAccessKeyName: "",
    url: "",
};

export class IntelRunner {
    private intelligenceManager: IntelligentServicesManager | undefined;

    constructor(private readonly document: FlowDocument, private readonly insightsMap: ISharedMap) {
    }

    public async start(): Promise<void> {
        this.intelligenceManager = new IntelligentServicesManager(this.document, this.insightsMap);
        this.intelligenceManager.registerService(textAnalytics.factory.create(textAnalyticsConfig));
        this.intelligenceManager.registerService(resumeAnalytics.factory.create(resumeAnalyticsConfig));
        this.intelligenceManager.process();
    }
}

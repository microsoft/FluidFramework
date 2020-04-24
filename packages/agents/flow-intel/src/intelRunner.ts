/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { FlowDocument } from "@fluid-example/webflow";
import { ISharedMap } from "@microsoft/fluid-map";
import { resumeAnalytics, textAnalytics } from "./analytics";
import { IntelligentServicesManager } from "./serviceManager";

export interface ITokenConfig {
    key: string;
}

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
        private readonly config: ITokenConfig) {
    }

    public async start(): Promise<void> {
        this.intelligenceManager = new IntelligentServicesManager(this.document, this.insightsMap);
        this.intelligenceManager.registerService(textAnalytics.factory.create(this.config));
        this.intelligenceManager.registerService(resumeAnalytics.factory.create(resumeAnalyticsConfig));
        this.intelligenceManager.process();
    }

    public stop() {
        if (this.intelligenceManager) {
            this.intelligenceManager.stop();
        }
    }
}

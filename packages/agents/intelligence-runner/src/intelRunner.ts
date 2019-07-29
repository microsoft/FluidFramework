/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedMap } from "@prague/map";
import * as Sequence from "@prague/sequence";
import { resumeAnalytics, textAnalytics } from "./analytics" ;
import { IntelligentServicesManager } from "./serviceManager";

const resumeAnalyticsConfig = {
    deviceId: "",
    host: "",
    sharedAccessKey: "",
    sharedAccessKeyName: "",
    url: "",
};

export class IntelRunner {
    private intelligenceManager: IntelligentServicesManager | undefined;

    constructor(
        private readonly sharedString: Sequence.SharedString,
        private readonly insightsMap: ISharedMap,
        private readonly apiKey: string) {
    }

    public async start(): Promise<void> {
        const textAnalyticsConfig = {
            key: this.apiKey,
        };
        await this.insightsMap.wait(this.sharedString.id);
        this.intelligenceManager = new IntelligentServicesManager(this.sharedString, this.insightsMap);
        this.intelligenceManager.registerService(textAnalytics.factory.create(textAnalyticsConfig));
        this.intelligenceManager.registerService(resumeAnalytics.factory.create(resumeAnalyticsConfig));
        this.intelligenceManager.process();
    }
}

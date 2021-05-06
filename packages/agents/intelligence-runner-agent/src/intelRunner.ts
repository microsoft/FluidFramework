/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedMap } from "@fluidframework/map";
import * as Sequence from "@fluidframework/sequence";
import { resumeAnalytics, textAnalytics } from "./analytics";
import { IntelligentServicesManager } from "./serviceManager";

export interface ITokenConfig {
    key: string;
}

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
        private readonly config: ITokenConfig) {
    }

    public async start(): Promise<void> {
        await this.insightsMap.wait(this.sharedString.id);
        this.intelligenceManager = new IntelligentServicesManager(this.sharedString, this.insightsMap);
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

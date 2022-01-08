/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedMap, IValueChanged } from "@fluidframework/map";
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

const mapWait = async <T = any>(map: ISharedMap, key: string): Promise<T> => {
    const maybeValue = map.get<T>(key);
    if (maybeValue !== undefined) {
        return maybeValue;
    }

    return new Promise((resolve) => {
        const handler = (changed: IValueChanged) => {
            if (changed.key === key) {
                map.off("valueChanged", handler);
                const value = map.get<T>(changed.key);
                if (value === undefined) {
                    throw new Error("Unexpected valueChanged result");
                }
                resolve(value);
            }
        };
        map.on("valueChanged", handler);
    });
};

export class IntelRunner {
    private intelligenceManager: IntelligentServicesManager | undefined;

    constructor(
        private readonly sharedString: Sequence.SharedString,
        private readonly insightsMap: ISharedMap,
        private readonly config: ITokenConfig) {
    }

    public async start(): Promise<void> {
        await mapWait(this.insightsMap, this.sharedString.id);
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

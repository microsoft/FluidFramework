/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IIntelligentService, IIntelligentServiceFactory } from "./api";

export interface IConfig {
    deviceId: string;
    host: string;
    sharedAccessKey: string;
    sharedAccessKeyName: string;
    url: string;
}

class ResumeAnalyticsIntelligentService implements IIntelligentService {
    public name: string = "ResumeAnalytics";
    private lastProb = 0;

    constructor(private readonly url: string) {
    }

    public async run(value: string): Promise<any> {
        const condensed = value.substring(0, Math.min(value.length, 10000));
        const data: any = {
            documents: [{
                id: "1",
                text: condensed,
            }],
        };
        const resumeAnalyticsResult = await this.invokeRequest(this.url, data);
        return {
            resumeAnalyticsResult,
        };
    }

    // This is a fake resume classifier just for the demo since the original service is not working.
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    private invokeRequest(service: string, data: any): Promise<any> {
        return new Promise<any>((resolve, reject) => {
            const text = data.documents[0].text as string;
            if (text.includes("(bsd & SVr3/r4)")) {
                const prob = Math.max(this.lastProb, Math.random() * (92 - 80) + 80);
                this.lastProb = prob;
                resolve((prob * 1) / 100);
            } else {
                resolve(0.2);
            }
        });
    }

    /*
    private invokeRequest(service: string, data: any): Promise<any> {
        return new Promise<any>((resolve, reject) => {
            request.post(
                service,
                {
                    body: data,
                    headers: {
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                    },
                    json: true,
                },
                (error, result, body) => {
                    if (error) {
                        return reject(error);
                    }

                    if (result.statusCode !== 200) {
                        return reject(result);
                    }

                    return resolve(body);
                });
        });
    } */
}

export class ResumeAnalyticsFactory implements IIntelligentServiceFactory {
    public create(config: IConfig): IIntelligentService {
        return new ResumeAnalyticsIntelligentService(config.url);
    }
}

export const factory = new ResumeAnalyticsFactory();

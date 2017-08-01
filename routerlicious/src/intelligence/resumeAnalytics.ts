import * as request from "request";
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

    constructor(private url: string) {
    }

    public async run(value: string): Promise<any> {
        const condensed = value.substring(0, Math.min(value.length, 5012));
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
    }
}

export class ResumeAnalyticsFactory implements IIntelligentServiceFactory {
    public create(config: IConfig): IIntelligentService {
        return new ResumeAnalyticsIntelligentService(config.url);
    }
}

export const factory = new ResumeAnalyticsFactory();

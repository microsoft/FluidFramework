import * as request from "request";
import { IIntelligentService, IIntelligentServiceFactory } from "./api";

const route = "resume";

export interface IConfig {
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
        const resumeAnalyticsResult = await this.invokeRequest(this.url + route, data);
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
    public create(url: string): IIntelligentService {
        return new ResumeAnalyticsIntelligentService(url);
    }
}

export const factory = new ResumeAnalyticsFactory();

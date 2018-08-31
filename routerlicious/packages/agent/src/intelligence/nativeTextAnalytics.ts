import * as request from "request";
import { IIntelligentService, IIntelligentServiceFactory } from "./api";

const route = "api/sentiment/query";

export interface IConfig {
    url: string;
}

class NativeTextAnalyticsIntelligentService implements IIntelligentService {
    public name: string = "NativeTextAnalytics";

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
        const nativeSentimentResult = await this.invokeRequest(this.url + route, data);
        return {
            nativeSentimentResult,
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

export class NativeTextAnalyticsFactory implements IIntelligentServiceFactory {
    public create(config: IConfig): IIntelligentService {
        return new NativeTextAnalyticsIntelligentService(config.url);
    }
}

export const factory = new NativeTextAnalyticsFactory();

import * as request from "request";
import { IIntelligentService, IIntelligentServiceFactory } from "./api";

const route = "resume";

export interface IConfig {
    url: string;
}

class NativeTextAnalyticsIntelligentService implements IIntelligentService {
    public name: string = "Resume";

    constructor(private url: string) {
    }

    public async run(value: string): Promise<any> {
        const condensed = value.substring(0, Math.min(value.length, 5012));
        const resumeAnalyticsResult = await this.invokeRequest(this.url + route, condensed);
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
        return new NativeTextAnalyticsIntelligentService("http://alfred:3000/intelligence/");
    }
}

export const factory = new ResumeAnalyticsFactory();

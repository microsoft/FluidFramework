import * as request from "request";
import { IIntelligentService, IIntelligentServiceFactory } from "./api";

export interface IConfig {
    url: string;
}

class SpellcheckerService implements IIntelligentService {
    public name: string = "Spellchecker";

    constructor(private url: string) {
    }

    public async run(value: string): Promise<any> {
        const data: any = {
            documents: [{
                end: 20,
                id: "1",
                rsn: 100,
                start: 0,
                text: value,
            }],
        };
        const spellcheckerResult = await this.invokeRequest(this.url, data);
        return {
            spellcheckerResult,
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

export class SpellcheckerServiceFactory implements IIntelligentServiceFactory {
    public create(config: IConfig): IIntelligentService {
        return new SpellcheckerService(config.url);
    }
}

export const factory = new SpellcheckerServiceFactory();

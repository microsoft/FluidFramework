import * as request from "request";
import { IIntelligentService, IIntelligentServiceFactory } from "./api";

const sentimentUrl = "https://westus.api.cognitive.microsoft.com/text/analytics/v2.0/sentiment";
const keyPhrasesUrl = "https://westus.api.cognitive.microsoft.com/text/analytics/v2.0/keyPhrases";
const languageUrl = "https://westus.api.cognitive.microsoft.com/text/analytics/v2.0/languages";

export interface IConfig {
    key: string;
}

class TextAnalyticsIntelligentService implements IIntelligentService {
    public name: string = "TextAnalytics";

    constructor(private key: string) {
    }

    public async run(value: string): Promise<any> {
        const condensed = value.substring(0, Math.min(value.length, 5012));
        const data: any = {
            documents: [{
                id: "1",
                text: condensed,
            }],
        };

        // Start by detecting the language
        const languageResult = await this.invokeRequest(languageUrl, data);
        const detectedLanguages = languageResult.documents[0].detectedLanguages as any[];
        detectedLanguages.sort((a, b) => a.score - b.score);

        // And then use the top rank to trigger the remaining calls
        const language = detectedLanguages[0].iso6391Name;
        data.documents[0].language = language;
        const sentimentResultP = this.invokeRequest(sentimentUrl, data);
        const keyPhrasesResultP = this.invokeRequest(keyPhrasesUrl, data);
        const results = await Promise.all([sentimentResultP, keyPhrasesResultP]);

        const sentiment = results[0].documents[0].score;
        const keyPhrases = results[1].documents[0].keyPhrases;

        return {
            language,
            keyPhrases,
            sentiment,
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
                        "Ocp-Apim-Subscription-Key": this.key,
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

export class TextAnalyticsFactory implements IIntelligentServiceFactory {
    public create(config: IConfig): IIntelligentService {
        return new TextAnalyticsIntelligentService(config.key);
    }
}

export const factory = new TextAnalyticsFactory();

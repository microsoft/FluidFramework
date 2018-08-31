import { core } from "@prague/client-api";
import * as request from "request";
import { IIntelligentService, IIntelligentServiceFactory } from "./api";

const imageURL = "https://westus2.api.cognitive.microsoft.com/vision/v2.0/describe";

export interface IConfig {
    key: string;
}

// TODO (sabroner): stop using this directly
export class ImageAnalyticsIntelligentService implements IIntelligentService {
    public name: string = "ImageAnalytics";

    constructor(private key: string) {
    }

    public async run(imageBlob: core.IImageBlob): Promise<any> {

        const result = this.invokeRequest(imageURL, imageBlob);
        return result;
    }

    private invokeRequest(service: string, data: core.IImageBlob): Promise<any> {
        return new Promise<any>((resolve, reject) => {
            request.post(
                service,
                {
                    body: data.content,
                    headers: {
                        "Accept": "application/json",
                        "Content-Type": "application/octet-stream",
                        "Ocp-Apim-Subscription-Key": this.key,
                    },
                    json: false, // Must be false or else the buffer gets improperly stringified
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

// TODO (sabroner): Work this into intelWork
export class ImageAnalyticsFactory implements IIntelligentServiceFactory {
    public create(config: IConfig): IIntelligentService {
        return new ImageAnalyticsIntelligentService(config.key);
    }
}

export const factory = new ImageAnalyticsFactory();

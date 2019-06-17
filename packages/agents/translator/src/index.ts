import { IComponent, IComponentRouter, IRequest, IResponse } from "@prague/container-definitions";
import { ISharedMap } from "@prague/map";
import * as Sequence from "@prague/sequence";
import { SharedStringTranslator } from "./sharedStringTranslator";

export interface ITranslator {
    run(sharedString: Sequence.SharedString, insightsMap: ISharedMap, apiKey: string): void;
}

export class Translator implements IComponent, IComponentRouter, ITranslator {

    public static supportedInterfaces = ["ITranslator"];

    public query(id: string): any {
        return Translator.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
    }

    public list(): string[] {
        return Translator.supportedInterfaces;
    }

    public run(
        sharedString: Sequence.SharedString,
        insightsMap: ISharedMap,
        apiKey: string) {
        const translator = new SharedStringTranslator(insightsMap, sharedString, apiKey);
        translator.start().catch((err) => {
            console.log(err);
        });
    }

    public async request(request: IRequest): Promise<IResponse> {
        return {
            mimeType: "prague/component",
            status: 200,
            value: this,
        };
    }

}

export function run(
    sharedString: Sequence.SharedString,
    insightsMap: ISharedMap,
    apiKey: string) {
    const translator = new SharedStringTranslator(insightsMap, sharedString, apiKey);
    translator.start().catch((err) => {
        console.log(err);
    });
}

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import request from "request";

interface ITranslatorInput {
    Text: string;
}

interface ITranslatorOutputUnit {
    text: string;
    to: string;
}

interface ITranslatorOutput {
    translations: ITranslatorOutputUnit[];
}

function createRequestUri(from: string, to: string[]): string {
    const uri = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0`;
    const fromLanguage = `&from=${from}&to=`;
    const toLanguages = to.join(`&to=`);
    return uri.concat(fromLanguage, toLanguages);
}

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
function createRequestBody(texts: string[]): ITranslatorInput[] {
    return texts.map((text: string) => {
        const input: ITranslatorInput = { Text: text };
        return input;
    });
}

function processTranslationOutput(input: ITranslatorOutput[]): Map<string, string[]> {
    const languageText = new Map<string, string[]>();
    for (const unit of input) {
        for (const translation of unit.translations) {
            if (!languageText.has(translation.to)) {
                languageText.set(translation.to, []);
            }
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            languageText.get(translation.to)!.push(translation.text);
        }
    }
    return languageText;
}

async function translateCore(key: string, from: string, to: string[], text: string[]): Promise<ITranslatorOutput[]> {
    const uri = createRequestUri(from, to);

    const requestBody = createRequestBody(text);

    return new Promise<ITranslatorOutput[]>((resolve, reject) => {
        request(
            {
                body: requestBody,
                headers: {
                    "Content-Type": "application/json",
                    "Ocp-Apim-Subscription-Key": key,
                },
                json: true,
                method: "POST",
                uri,
            },
            (err, resp, body) => {
                if (err || resp.statusCode !== 200) {
                    reject(err || body);
                } else {
                    resolve(body as ITranslatorOutput[]);
                }
            });
    });
}

export async function translate(
    key: string,
    from: string,
    to: string[],
    text: string[]): Promise<Map<string, string[]>> {
    const rawTranslation = await translateCore(key, from, to, text);
    return processTranslationOutput(rawTranslation);
}

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as request from "request";

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

function createRequestUri(from: string, to: string[]): string | undefined {
    const uri = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0`;
    const fromLanguage = `&from=${from}&to=`;
    const toSubset = to.filter((lang: string) => lang !== from);
    if (toSubset.length > 0) {
        const toLanguages = toSubset.join(`&to=`);
        return uri.concat(fromLanguage, toLanguages);
    }
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

async function translateCore(
    key: string,
    from: string,
    to: string[],
    text: string[],
): Promise<ITranslatorOutput[] | undefined> {
    const uri = createRequestUri(from, to);
    if (uri) {
        const requestBody = createRequestBody(text);
        return new Promise<ITranslatorOutput[]>((resolve, reject) => {
            request.post(
                {
                    body: requestBody,
                    headers: {
                        "Content-Type": "application/json",
                        "Ocp-Apim-Subscription-Key": key,
                    },
                    json: true,
                    method: "POST",
                    url: uri,
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
}

export async function translate(
    key: string,
    from: string,
    to: string[],
    text: string[],
): Promise<Map<string, string[]> | undefined> {
    const rawTranslation = await translateCore(key, from, to, text);
    if (rawTranslation) {
        return processTranslationOutput(rawTranslation);
    }
}

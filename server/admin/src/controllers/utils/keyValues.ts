/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import request from "request-promise-native";
import { IKeyValue } from "../../definitions";

export async function addKeyValue(url: string, keyValueToAdd: IKeyValue): Promise<IKeyValue> {
    const newKeyValue = await request.post(
        `${url}/api/keyValues`,
        {
            body: keyValueToAdd,
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            json: true,
        });
    return newKeyValue;
}

export async function deleteKey(url: string, key: string): Promise<string> {
    await request.delete(
        `${url}/api/keyValues/${key}`,
        {
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            json: true,
        },
    );
    return key;
}

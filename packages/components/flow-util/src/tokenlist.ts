/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { CharCode } from "./charcode";

export function findToken(tokenList: string, token: string) {
    const start = tokenList.indexOf(token);

    if (start !== 0 && tokenList.charCodeAt(start - 1) !== CharCode.space) {
        return undefined;
    }

    const end = start + token.length;
    if (end !== tokenList.length && tokenList.charCodeAt(end) !== CharCode.space) {
        return undefined;
    }

    return { start, end };
}

// tslint:disable-next-line:no-namespace
export namespace TokenList {
    export function set(tokenList: string, token: string) {
        return tokenList && tokenList.length > 0
            ? findToken(tokenList, token) !== undefined
                ? tokenList                     // If the token already exists, return the original list
                : `${tokenList} ${token}`       // ...otherwise append it.
            : token;                            // If the current list is empty, return the token.
    }

    export function unset(tokenList: string, token: string) {
        const span = findToken(tokenList, token);
        if (!span) {
            return tokenList;
        }

        const { start, end } = span;

        return end < tokenList.length
            ? `${tokenList.slice(0, start)}${tokenList.slice(end + 1)}`
            : tokenList.slice(0, start > 0 ? start - 1 : 0);
    }

    export function computeToggle(tokenList: string, toAdd: string[], toRemove: Set<string>) {
        for (let i = toAdd.length - 1; i >= 0; i--) {
            const token = toAdd[i];
            if (findToken(tokenList, token)) {
                toRemove.add(token);
                toAdd.splice(i, 1);
            }
        }
    }
}

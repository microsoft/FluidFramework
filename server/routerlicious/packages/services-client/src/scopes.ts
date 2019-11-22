/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ScopeType } from "@microsoft/fluid-protocol-definitions";

interface IScope {
    read: boolean;
    write: boolean;
    summarize: boolean;
}

function calculateScope(scopes: string[]): IScope | undefined {
    if (scopes === undefined || scopes.length === 0) {
        return undefined;
    }
    const read = scopes.indexOf(ScopeType.DocRead) !== -1;
    const write = scopes.indexOf(ScopeType.DocWrite) !== -1;
    const summarize = scopes.indexOf(ScopeType.SummaryWrite) !== -1;
    return {
        read,
        summarize,
        write,
    };
}

// tslint:disable-next-line:no-suspicious-comment
// TODO: undefined returns true only for back-compat. return false when everybody upgrades.
export function canRead(scopes: string[]): boolean {
    const clientScope = calculateScope(scopes);
    return clientScope === undefined ? true : clientScope.read;
}

export function canWrite(scopes: string[]): boolean {
    const clientScope = calculateScope(scopes);
    return clientScope === undefined ? true : clientScope.write;
}

export function canSummarize(scopes: string[]): boolean {
    const clientScope = calculateScope(scopes);
    return clientScope === undefined ? true : clientScope.summarize;
}

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";

// converts all properties of an object to arrays of the
// properties potential values. This will be used by generatePairwiseOptions
// to compute original objects that contain pairwise combinations
// of all property values
export type OptionsMatrix<T extends Record<string, any>> =
    Required<{
        [K in keyof T]: Exclude<T[K], undefined | boolean | number | string> extends  never
            ? readonly (T[K])[]
            : readonly (OptionsMatrix<T[K]>)[]
    }>;

export const booleanCases: readonly (boolean)[] = [true, false];
export const numberCases: readonly (number | undefined)[] = [undefined];

type PartialWithKeyCount<T extends Record<string, any>>= (Partial<T> & {__paritalKeyCount?: number});

function applyPairToPartial<T extends Record<string, any>>(
    partials: PartialWithKeyCount<T>[],
    pair: {iKey: keyof T, jKey: keyof T, iVal: any, jVal: any},
) {
    let found: PartialWithKeyCount<T> | undefined;
    for(const partial of partials) {
        // the pair exists, so nothing to do
        if(partial[pair.iKey] === pair.iVal && partial[pair.jKey] === pair.jVal) {
            return;
        }

        if(pair.iKey in partial && partial[pair.iKey] === pair.iVal && !(pair.jKey in partial)
            || pair.jKey in partial && partial[pair.jKey] === pair.jVal && !(pair.iKey in partial)) {
            found = partial;
            break;
        }
    }
    if(found === undefined) {
        const partial: PartialWithKeyCount<T> = {};
        partial.__paritalKeyCount = 2;
        partial[pair.iKey] = pair.iVal;
        partial[pair.jKey] = pair.jVal;
        partials.push(partial);
    }else{
        if(pair.iKey in found) {
            found[pair.jKey] = pair.jVal;
        }else{
            found[pair.iKey] = pair.iVal;
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        found.__paritalKeyCount!++;
    }
}

export function generatePairwiseOptions<T extends Record<string, any>>(optionsMatrix: OptionsMatrix<T>): T[] {
    const valuesMap = new Map<keyof T, any[]>();
    for(const key of Object.keys(optionsMatrix)) {
        const matrixProp = optionsMatrix[key];
        const values: any[] = [];
        assert(Array.isArray(matrixProp), "matrix prop must be an array");
        // if the only value is undefined, we can skip this property
        if(matrixProp.length > 1 || matrixProp[0] !== undefined) {
            for(const val of matrixProp) {
                if(typeof val === "object") {
                    const subOptions = generatePairwiseOptions<any>(val);
                    if(subOptions.length > 1 || subOptions[0] !== undefined) {
                        values.push(...subOptions);
                    }
                }else{
                    values.push(val);
                }
            }
            if(values.length > 1 || values[0] !== undefined) {
                valuesMap.set(key, values);
            }
        }
    }
    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    const matrixKeys: (keyof T)[] =
        Array.from(valuesMap.keys()).sort((a,b)=>valuesMap.get(b)!.length  - valuesMap.get(a)!.length);
    // compute all the pairs of property values, and apply them
    const partials: PartialWithKeyCount<T>[] = [];
    for(const iKey of matrixKeys) {
        for(const jKey of matrixKeys.slice(matrixKeys.indexOf(iKey) + 1)) {
            for(const iVal of valuesMap.get(iKey)!) {
                for(const jVal of valuesMap.get(jKey)!) {
                    applyPairToPartial(partials, {iKey, iVal, jKey, jVal});
                }
            }
        }
    }

    // fix up any incomplete outputs
    for(const partial of partials) {
        if(partial.__paritalKeyCount !== matrixKeys.length) {
            for(const key of matrixKeys) {
                if(!(key in partial)) {
                    const values = valuesMap.get(key)!;
                    partial[key] = values[Math.floor(Math.random() * values.length)];
                }
            }
        }
        delete partial.__paritalKeyCount;
    }
    /* eslint-enable @typescript-eslint/no-non-null-assertion */

    return partials as T[];
}

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { generatePairwiseOptions, OptionsMatrix } from "../index";

interface SimpleOptions{
    oBoolean?: boolean,
    rBoolean: boolean,
    number?: number,
    string?: string,
}
const optionsToString = <T>(... options: T[]) =>
    options.map((o)=>JSON.stringify(o))
    .join("\n");

const simpleOptionsMatrix: OptionsMatrix<SimpleOptions> = {
    number:[undefined, 7],
    oBoolean: [undefined, true],
    rBoolean: [true, false],
    string: [undefined],
};
function  validateSimpleOption(option: SimpleOptions) {
    assert("number" in option, `number not defined:${option}`);
    assert(option.number === undefined || option.number === 7, `number not expected value:${option}`);
    assert("oBoolean" in option, `oBoolean not defined:${option}`);
    assert(option.oBoolean === undefined || option.oBoolean === true, `oBoolean not expected value:${option}`);
    assert("rBoolean" in option, `rBoolean not defined:${option}`);
    assert(option.rBoolean === true || option.rBoolean === false, `rBoolean not expected value:${option}`);
    // string only has undefined as a value, so should be pruned from exploration
    assert(!("string" in option), `string is defined:${option}`);
}

const simpleValues = generatePairwiseOptions<SimpleOptions>(simpleOptionsMatrix);

interface ComplexOptions {
    oSimple?: SimpleOptions;
    rSimple: SimpleOptions;
    boolean?: boolean
}

const complexOptionsMatrix: OptionsMatrix<ComplexOptions> = {
    boolean: [undefined, true, false],
    oSimple: [undefined],
    rSimple: [simpleOptionsMatrix],
};

const complexValues = generatePairwiseOptions<ComplexOptions>(complexOptionsMatrix);

function validateComplexOption(option: ComplexOptions) {
    assert("boolean" in option, `boolean not defined:${option}`);
    assert(
        option.boolean === undefined || option.boolean === true || option.boolean === false,
        `boolean not expected value:${option}`);

    assert("rSimple" in option, `rSimple not defined:${option}`);
    validateSimpleOption(option.rSimple);

    // oSimple only has undefined as a value, so should be pruned from exploration
    assert(!("oSimple" in option), `oSimple is defined:${option}`);
}

// no-recursive type for validation
export type ValuesMatrix<T extends Record<string, any>> =
    Required<{
        [K in keyof T]: readonly (T[K])[]
    }>;

/**
 * No pruning or optimizations, just calculate and validate all pairs
 */
function  validatePairsExhaustively<T>(
    matrix: ValuesMatrix<T>, values: T[]) {
    const keys = Object.keys(matrix);
    for(const i of keys) {
        for(const j of keys) {
            if(i === j) {
                continue;
            }
            for(const iv of matrix[i]) {
                for(const jv of matrix[j]) {
                    let found = false;
                    for(const val of values) {
                        if(JSON.stringify(val[i]) === JSON.stringify(iv)
                            && JSON.stringify(val[j]) === JSON.stringify(jv)) {
                            found = true;
                            break;
                        }
                    }
                    assert(
                        found,
                        // eslint-disable-next-line max-len
                        `failed to find pair: ${i} === ${optionsToString(iv)} && ${j} === ${optionsToString(jv)}\n${optionsToString(...values)}`);
                }
            }
        }
    }
}

describe("generatePairwiseOptions",()=>{
    it("SimpleOptions",()=>{
        assert.strictEqual(simpleValues.length, 6, optionsToString(...simpleValues));

        for(const option of simpleValues) {
            validateSimpleOption(option);
        }
        validatePairsExhaustively(simpleOptionsMatrix, simpleValues);
    });

    it("ComplexOptions",()=>{
        assert.strictEqual(complexValues.length, 18, optionsToString(...complexValues));

        for(const option of complexValues) {
            validateComplexOption(option);
        }

        validatePairsExhaustively<ComplexOptions>({
            boolean: complexOptionsMatrix.boolean,
            oSimple:  [undefined],
            // this option is the pairwise set used on the simple test and is validate there
            // reusing here validates we correctly compute the recursive matrix
            rSimple: simpleValues,
            },
            complexValues);
    });
});

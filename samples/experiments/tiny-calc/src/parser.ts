/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

type ParseResult = number | null;
type ParseFn = () => ParseResult;
export interface IRef { start: number; end: number; $: RegExpExecArray; }

let refs: IRef[];   // Found cell references
let pos: number;    // Current parsing position
let s: string;      // Input string

// Matches a terminal (described as a regex).
const sym = (pattern: RegExp, accept: (start: number, matches: RegExpExecArray) => void = (start, matches) => matches[1]): ParseFn => () => {
    const $ = pattern.exec(s.slice(pos));
    if ($ === null) {
        return null;
    }
    const end = pos + $[0].length;
    if (accept) { accept(pos, $); }
    return end;
};

// Matches the given sequence of terms.
const seq = (terms: ParseFn[]): ParseFn => () => {
    const start = pos;
    for (const term of terms) {
        const result = term();
        if (result === null) {
            pos = start;
            return null;
        }

        pos = result;
    }
    return pos;
};

// Matches zero or more of the given term.
const star = (term: ParseFn): ParseFn => () => {
    let res: ParseResult;

    // tslint:disable-next-line:no-conditional-assignment
    while ((res = term()) !== null) {
        pos = res;
    }

    return pos;
};

// Grammar
const num = sym(/^\s*(-?\d+\.?\d*(?:[eE][-+]?\d+)?)/);
const bool = sym(/^\s*(true|false)/);
const cellRange = sym(/^\s*((\$?)([A-Z]+)(\$?)(\d+)(?:(:\$?)([A-Z]+)(\$?)(\d+))?)/, (start, $) => refs.push({ $, start, end: start + $[0].length }));
const primary = () => num() || bool() || group() || cellRange();
const unary = seq([sym(/^\s*(!|-)?/), primary]);
const expr = seq([unary, star(seq([sym(/^\s*(<=|>=|<>|<|>|=|^|\/|\*|\+|-)/), unary]))]);
const group = seq([sym(/^\s*(\()/), expr, sym(/^\s*(\))/)]);

// Entry point
export function parse(formulaExpr: string) {
    pos = 0;
    refs = [];
    s = formulaExpr;
    return { expr: expr(), refs };
}

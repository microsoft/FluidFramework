/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable:object-literal-sort-keys align
import * as MergeTree from "@prague/merge-tree";
import * as Katex from "katex";
import { CharacterCodes } from "../text";
import * as SearchMenu from "./searchMenu";

export const cursorTex = " \\textcolor{#800080}{\\vert}";
export const cursorColor = "rgb(128, 0, 128)";
export function boxEmptyParam(viewText: string) {
    return viewText.replace(/\{\}/g, "{\\Box}");
}

export enum MathTokenType {
    Variable,
    Command,
    InfixOp,
    LCurly,
    RCurly,
    MidCommand,
    EndCommand,
    Space,
}

export const Nope = -1;

export interface IMathMarker extends MergeTree.Marker {
    mathCursor: number;
    mathTokenIndex: number;
    mathTokens: MathToken[];
    mathViewBuffer?: string;
    mathText: string;
}

export interface IMathCommand extends SearchMenu.ISearchMenuCommand {
    arity?: number;
    infix?: boolean;
    sub?: boolean;
    exp?: boolean;
    op?: Operator;
    prec?: TokenPrecedence;
    texString?: string;
    tokenType?: MathTokenType;
}

function addCommand(cmdTree: MergeTree.TST<IMathCommand>, command: IMathCommand) {
    if (command.texString) {
        command.iconHTML = Katex.renderToString(command.texString, { throwOnError: false });
    }
    cmdTree.put(command.key, command);
}

export function mathMenuCreate(context: any, boundingElm: HTMLElement,
    onSubmit: (s: string, cmd?: IMathCommand) => void) {
    return SearchMenu.searchBoxCreate(context, boundingElm, mathCmdTree, false, onSubmit);
}

export const mathCmdTree = new MergeTree.TST<IMathCommand>();
const greekLetters = [
    "alpha", "beta", "gamma", "delta", "epsilon", "constepsilon",
    "zeta", "eta", "Gamma", "Delta", "Theta", "theta", "vartheta",
    "iota", "kappa", "lambda", "mu", "nu", "xi", "Lambda", "Xi",
    "Pi", "pi", "varpi", "rho", "varrho", "sigma", "varsigma",
    "Sigma", "Upsilon", "Phi", "upsilon", "phi", "varphi", "chi",
    "psi", "omega", "Psi", "Omega",
];
const bigOpsSubExp = [
    "int", "sum", "prod", "coprod", "oint",
];
const bigOpsSub = [
    "bigcup", "bigcap", "bigsqcup", "bigvee", "bigwedge", "lim",
];

export enum TokenPrecedence {
    NONE,
    IMPLIES,
    REL,
    LOG,
    IN,
    ADD,
    MUL,
    NEG,
    EXP,
    UNDER,
}

enum Operator {
    IMPLIES,
    EQ,
    LEQ,
    GEQ,
    MUL,
    DIV,
    ADD,
    SUB,
    EXP,
    UNDER,
    IN,
    NOTIN,
    SUBSET,
    SETMINUS,
    PLUSMINUS,
    INTERSECTION,
    AND,
    OR,
    UNION,
    CONG,
    SUBSETEQ,
    VDASH,
    EQUIV,
    OWNS,
    FORALL,
    EXISTS,
}

// SETMINUS, PLUSMINUS, INTERSECTION, AND, OR, UNION, CONG, SUBSETEQ, VDASH, EQUIV, OWNS
const binaryOperators = [
    { key: "setminus", op: Operator.SETMINUS },
    { key: "times", op: Operator.MUL },
    { key: "div", op: Operator.DIV },
    { key: "pm", op: Operator.PLUSMINUS },
    { key: "cap", op: Operator.INTERSECTION },
    { key: "wedge", op: Operator.AND },
    { key: "vee", op: Operator.OR },
    { key: "land", op: Operator.AND },
    { key: "cup", op: Operator.UNION },
];
const binaryRelations = [
    { key: "leq", op: Operator.LEQ },
    { key: "geq", op: Operator.GEQ },
    { key: "cong", op: Operator.CONG },
    { key: "in", op: Operator.IN },
    { key: "notin", op: Operator.NOTIN },
    { key: "subset", op: Operator.SUBSET },
    { key: "subseteq", op: Operator.SUBSETEQ },
    { key: "vdash", op: Operator.VDASH },
    { key: "equiv", op: Operator.EQUIV },
    { key: "ni", op: Operator.OWNS },
    { key: "owns", op: Operator.OWNS },
    { key: "implies", op: Operator.IMPLIES },
];

const logic = [
    { key: "forall", op: Operator.FORALL },
    { key: "exists", op: Operator.EXISTS },
];

greekLetters.map((letter) => addCommand(mathCmdTree,
    { key: letter, arity: 0, texString: "\\" + letter + " ", tokenType: MathTokenType.Variable }));

bigOpsSubExp.map((name) => {
    addCommand(mathCmdTree, {
        key: name, arity: 0, sub: true, exp: true,
        texString: "\\" + name + " ",
    });
    addCommand(mathCmdTree, {
        key: name + "-over", arity: 0, sub: true, exp: true,
        texString: "\\" + name + "_{}^{}",
    });
});

bigOpsSub.map((name) => addCommand(mathCmdTree, {
    key: name, arity: 0, sub: true,
    texString: "\\" + name + " ",
}));

binaryOperators.map((oper) => addCommand(mathCmdTree, {
    key: oper.key, arity: 2, infix: true,
    op: oper.op, texString: "\\" + oper.key + " ",
}));

binaryRelations.map((oper) => addCommand(mathCmdTree, {
    key: oper.key, arity: 2, infix: true,
    op: oper.op, texString: "\\" + oper.key + " ",
}));

logic.map((oper) => addCommand(mathCmdTree, {
    key: oper.key, arity: 1,
    op: oper.op, texString: "\\" + oper.key + " ",
}));

const superCmd = { key: "^", arity: 1 };
const subCmd = { key: "_", arity: 1 };

addCommand(mathCmdTree, { key: "cos", arity: 0, exp: true, texString: "\\cos " });
addCommand(mathCmdTree, { key: "log", arity: 0, exp: true, texString: "\\log " });
addCommand(mathCmdTree, { key: "ln", arity: 0, exp: true, texString: "\\ln " });
addCommand(mathCmdTree, { key: "infty", arity: 0, texString: "\\infty " });
addCommand(mathCmdTree, { key: "Box", arity: 0, texString: "\\Box " });
addCommand(mathCmdTree, { key: "nabla", arity: 0, texString: "\\nabla " });

addCommand(mathCmdTree, { key: "partial", arity: 0, exp: true, texString: "\\partial" });
addCommand(mathCmdTree, { key: "neg", arity: 0, texString: "\\neg" });
addCommand(mathCmdTree, { key: "overline", arity: 1, texString: "\\overline{}" });
addCommand(mathCmdTree, { key: "circ", arity: 0, texString: "\\circ" });
addCommand(mathCmdTree, { key: "sin", arity: 1, exp: true, texString: "\\sin" });
addCommand(mathCmdTree, { key: "sqrt", arity: 1, texString: "\\sqrt{}" });
addCommand(mathCmdTree, { key: "to", arity: 0, texString: "\\to" });
addCommand(mathCmdTree, { key: "frac", arity: 2, texString: "\\frac{}{} " });

export function printTokens(tokIndex: number, mathCursor: number, tokens: MathToken[], mathText: string) {
    console.log(`Math indx ${tokIndex} cp ${mathCursor} is`);
    let buf = "";
    for (let i = 0, len = tokens.length; i < len; i++) {
        const tok = tokens[i];
        // tslint:disable:max-line-length
        buf += `${i} [${tok.start}, ${tok.end}): ${MathTokenType[tok.type]} ${mathText.substring(tok.start, tok.end)}`;
        if (tok.endTok) {
            buf += `et: ${tok.endTok.end}`;
        }
        buf += "\n";
    }
    console.log(buf);
}

export function printMathMarker(marker: IMathMarker) {
    printTokens(marker.mathTokenIndex, marker.mathCursor, marker.mathTokens, marker.mathText);
}

export function posAtToken(tokIndex: number, tokens: MathToken[]) {
    let pos = 0;
    for (let i = 0; i < tokIndex; i++) {
        if (i >= tokens.length) {
            return pos;
        }
        const tok = tokens[i];
        pos += (tok.end - tok.start);
    }
    return pos;
}

export function tokenAtPos(mathCursor: number, tokens: MathToken[]) {
    for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].start === mathCursor) {
            return i;
        }
    }
    return tokens.length;
}

export function mathTokFwd(tokIndex: number, tokens: MathToken[]) {
    const toklen = tokens.length;
    tokIndex++;
    while (tokIndex < toklen) {
        if (tokens[tokIndex].type === MathTokenType.Space) {
            tokIndex++;
        } else {
            break;
        }
    }
    return tokIndex;
}

/**
 * This function updates the mathCursor and mathTokenIndex properties of mathMarker
 * @param mathMarker marker for end of math region
 */
export function bksp(mathMarker: IMathMarker) {
    let curTok: MathToken;
    if (mathMarker.mathTokenIndex < mathMarker.mathTokens.length) {
        curTok = mathMarker.mathTokens[mathMarker.mathTokenIndex];
    }
    let prevTokIndex = mathTokRev(mathMarker.mathTokenIndex, mathMarker.mathTokens);
    while ((prevTokIndex >= 0) &&
        ((mathMarker.mathTokens[prevTokIndex].type === MathTokenType.EndCommand) ||
            (mathMarker.mathTokens[prevTokIndex].type === MathTokenType.MidCommand))) {
        prevTokIndex--;
    }
    if (prevTokIndex >= 0) {
        const prevTok = mathMarker.mathTokens[prevTokIndex];
        mathMarker.mathTokenIndex = prevTokIndex;
        mathMarker.mathCursor = prevTok.start;
        if ((prevTok.type === MathTokenType.Command) &&
            (prevTok.cmdInfo.arity > 0)) {
            return { start: prevTok.start, end: prevTok.endTok.end };
        } else {
            return { start: prevTok.start, end: prevTok.end };
        }
    }
}

export function mathTokRev(tokIndex: number, tokens: MathToken[]) {
    tokIndex--;
    if (tokIndex > (tokens.length - 1)) {
        tokIndex = tokens.length - 1;
    }
    while (tokIndex >= 0) {
        const tok = tokens[tokIndex];
        if (tok.type === MathTokenType.Space) {
            tokIndex--;
        } else {
            break;
        }
    }
    if (tokIndex >= 0) {
        return tokIndex;
    } else {
        return Nope;
    }
}

export class MathToken {
    // command for which this token ends an operand
    public paramCmd?: MathToken;
    // operand index if paramCmd defined
    public paramIndex?: number;
    // for a command, the number of operands seen so far
    public paramRefRemaining?: number;
    // for a command, the token ending the last operand
    public endTok?: MathToken;
    constructor(public type: MathTokenType, public start: number, public end: number,
        public cmdInfo?: IMathCommand) {
    }
}

function isAlpha(c: number) {
    return ((c >= CharacterCodes.a) && (c <= CharacterCodes.z)) ||
        ((c >= CharacterCodes.A) && (c <= CharacterCodes.Z));
}

function isNumber(c: number) {
    return ((c >= CharacterCodes._0) && (c <= CharacterCodes._9));
}

function isMathPunct(c: number) {
    return (c === CharacterCodes.openParen) ||
        (c === CharacterCodes.closeParen) ||
        (c === CharacterCodes.equals) ||
        (c === CharacterCodes.minus) ||
        (c === CharacterCodes.plus);
}

export function transformInputCode(c: number) {
    if (isAlpha(c) || isMathPunct(c) || isNumber(c)) {
        return String.fromCharCode(c);
    } else {
        switch (c) {
            case CharacterCodes.caret:
                return "^{}";
            case CharacterCodes._:
                return "_{}";
        }
    }
}

export function lexCommand(tokens: MathToken[], pos: number, mathText: string, cmdStack: MathToken[]) {
    const len = mathText.length;
    const startPos = pos;
    pos++; // skip the backslash
    let c = mathText.charCodeAt(pos);
    while ((pos < len) && isAlpha(c)) {
        pos++;
        c = mathText.charCodeAt(pos);
    }
    let tokenType = MathTokenType.Command;
    const key = mathText.substring(startPos + 1, pos);
    const cmd = mathCmdTree.get(key);
    if (cmd.tokenType !== undefined) {
        tokenType = cmd.tokenType;
    }
    if (cmd.arity > 0) {
        // consume the "{"
        pos++;
    }
    const tok = new MathToken(tokenType, startPos, pos, cmd);
    tokens.push(tok);
    if (cmd.arity > 0) {
        tok.paramRefRemaining = cmd.arity;
        cmdStack.push(tok);
    }
    return pos;
}

export function lexSpace(tokens: MathToken[], pos: number, mathBuffer: string) {
    const len = mathBuffer.length;
    const startPos = pos;
    while ((mathBuffer.charAt(pos) === " ") && (pos < len)) {
        pos++;
    }
    if (startPos < pos) {
        tokens.push(new MathToken(MathTokenType.Space, startPos, pos));
    }
    return pos;
}
// chars not recognized as math input (such as "!") stopped
// at input filter level and not expected

function lexMathRange(mathBuffer: string, tokens: MathToken[],
    pos: number, cmdStack: MathToken[]) {
    const len = mathBuffer.length;
    while (pos < len) {
        const c = mathBuffer.charAt(pos);
        switch (c) {
            case "\\":
                pos = lexCommand(tokens, pos, mathBuffer, cmdStack);
                break;
            case "=":
            case "+":
            case "-":
                tokens.push(new MathToken(MathTokenType.InfixOp, pos, pos + 1));
                pos++;
                break;
            case "^": {
                const tok = new MathToken(MathTokenType.Command, pos, pos + 2, superCmd);
                tok.paramRefRemaining = 1;
                cmdStack.push(tok);
                tokens.push(tok);
                pos += 2;
                break;
            }
            case "_": {
                const tok = new MathToken(MathTokenType.Command, pos, pos + 2, subCmd);
                tok.paramRefRemaining = 1;
                cmdStack.push(tok);
                tokens.push(tok);
                pos += 2;
                break;
            }
            case "{":
                console.log(`shouldn't see { at pos ${pos})`);
                printTokens(0, 0, tokens, mathBuffer);
                pos++;
                break;
            case "}": {
                const start = pos;
                let tokenType = MathTokenType.RCurly;
                let cmd: MathToken;
                if (cmdStack.length > 0) {
                    cmd = cmdStack[cmdStack.length - 1];
                    if (cmd.paramRefRemaining > 1) {
                        pos++; // consume the following "{"
                        tokenType = MathTokenType.MidCommand;
                    }
                }
                pos++;
                const tok = new MathToken(tokenType, start, pos);
                tokens.push(tok);
                if (cmd !== undefined) {
                    tok.paramCmd = cmd;
                    tok.paramIndex = cmd.cmdInfo.arity - cmd.paramRefRemaining;
                    cmd.paramRefRemaining--;
                    if (cmd.paramRefRemaining === 0) {
                        cmdStack.pop();
                        tok.type = MathTokenType.EndCommand;
                        cmd.endTok = tok;
                    }
                }
                break;
            }
            case " ":
                pos = lexSpace(tokens, pos, mathBuffer);
                break;
            default:
                // assume single-character variable
                tokens.push(new MathToken(MathTokenType.Variable, pos, pos + 1));
                pos++;
                break;
        }
    }
    return tokens;
}

export function lexMath(mathBuffer: string) {
    return lexMathRange(mathBuffer, [] as MathToken[], 0, [] as MathToken[]);
}

export function initMathMarker(mathMarker: IMathMarker, mathText: string) {
    mathMarker.mathText = mathText;
    mathMarker.mathTokens = lexMath(mathMarker.mathText);
    mathMarker.mathCursor = 0;
    mathMarker.mathTokenIndex = 0;
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as SearchMenu from "@fluid-example/search-menu";
import { IFluidObject } from "@fluidframework/core-interfaces";
import * as MergeTree from "@fluidframework/merge-tree";
import * as Katex from "katex";
import { CharacterCodes } from "./characterCodes";

export const cursorTex = " \\textcolor{#800080}{\\vert}";
export const cursorColor = "rgb(128, 0, 128)";
export const boxEmptyParam = (viewText: string) => viewText.replace(/{}/g, "{\\Box}");

export enum MathTokenType {
    Variable,
    PatternVariable,
    PatternType,
    INT,
    REAL,
    Command,
    LCurly,
    RCurly,
    MidCommand,
    EndCommand,
    Space,
    Newline,
    EOI,
    SUB,
    ADD,
    DIV,
    MUL,
    LEQ,
    GEQ,
    OPAREN,
    CPAREN,
    COMMA,
    IMPLIES,
    Equals,
}

export const Nope = -1;

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

const addCommand = (cmdTree: MergeTree.TST<IMathCommand>, command: IMathCommand) => {
    if (command.texString) {
        command.iconHTML = Katex.renderToString(command.texString, { throwOnError: false });
    }
    cmdTree.put(command.key, command);
};
export const mathCmdTree = new MergeTree.TST<IMathCommand>();

export function mathMenuCreate(context: any, boundingElm: HTMLElement, onSubmit: (s: string, cmd?: IMathCommand) => void) {
    return SearchMenu.searchBoxCreate(context, boundingElm, mathCmdTree, false, onSubmit);
}

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

export interface ITokenProperties {
    flags: TokenLexFlags;
    op?: Operator;
    precedence?: TokenPrecedence;
    rightAssoc?: boolean;
}

export enum TokenLexFlags {
    None = 0x0,
    PrimaryFirstSet = 0x1,
    Binop = 0x2,
    Relop = 0x4 | Binop,
}
const singleTokText: string[] = [];
singleTokText[MathTokenType.SUB] = "-";
singleTokText[MathTokenType.DIV] = "";
singleTokText[MathTokenType.ADD] = "+";
singleTokText[MathTokenType.OPAREN] = "(";
singleTokText[MathTokenType.CPAREN] = ")";
singleTokText[MathTokenType.COMMA] = ",";

export function tokenText(tok: MathToken) {
    if (tok.text !== undefined) {
        return tok.text;
    } else {
        return singleTokText[tok.type];
    }
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

const texString: string[] = [];
texString[Operator.ADD] = "+";
texString[Operator.SUB] = "-";
texString[Operator.DIV] = "\\frac";
texString[Operator.EQ] = "=";
texString[Operator.UNDER] = "_";
texString[Operator.EXP] = "^";
texString[Operator.LEQ] = "\\leq ";
texString[Operator.GEQ] = "\\geq ";
texString[Operator.IMPLIES] = "\\Rightarrow ";
texString[Operator.MUL] = "";
texString[Operator.IN] = "\\in ";
texString[Operator.SETMINUS] = "\\setminus ";
texString[Operator.PLUSMINUS] = "\\pm ";
texString[Operator.INTERSECTION] = "\\cap ";
texString[Operator.AND] = "\\wedge ";
texString[Operator.OR] = "\\vee ";
texString[Operator.UNION] = "\\cup ";
texString[Operator.CONG] = "\\cong ";
texString[Operator.SUBSETEQ] = "\\subseteq ";
texString[Operator.VDASH] = "\\vdash ";
texString[Operator.EQUIV] = "\\equiv ";
texString[Operator.OWNS] = "\\owns ";
texString[Operator.NOTIN] = "\\notin ";
texString[Operator.SUBSET] = "\\subset ";

const tokenProps: ITokenProperties[] = [];
tokenProps[MathTokenType.INT] = { flags: TokenLexFlags.PrimaryFirstSet };
tokenProps[MathTokenType.REAL] = { flags: TokenLexFlags.PrimaryFirstSet };
tokenProps[MathTokenType.PatternVariable] = { flags: TokenLexFlags.PrimaryFirstSet };
tokenProps[MathTokenType.Variable] = { flags: TokenLexFlags.PrimaryFirstSet };
tokenProps[MathTokenType.Command] = { flags: TokenLexFlags.PrimaryFirstSet };
tokenProps[MathTokenType.OPAREN] = { flags: TokenLexFlags.PrimaryFirstSet };
tokenProps[MathTokenType.ADD] = {
    flags: TokenLexFlags.Binop,
    precedence: TokenPrecedence.ADD, op: Operator.ADD,
};
tokenProps[MathTokenType.SUB] = { flags: TokenLexFlags.Binop, precedence: TokenPrecedence.ADD, op: Operator.SUB };
tokenProps[MathTokenType.DIV] = {
    flags: TokenLexFlags.Binop,
    precedence: TokenPrecedence.MUL, op: Operator.DIV,
};
tokenProps[MathTokenType.MUL] = { flags: TokenLexFlags.Binop, precedence: TokenPrecedence.MUL, op: Operator.MUL };
tokenProps[MathTokenType.Equals] = { flags: TokenLexFlags.Relop, precedence: TokenPrecedence.REL, op: Operator.EQ };
tokenProps[MathTokenType.LEQ] = { flags: TokenLexFlags.Relop, precedence: TokenPrecedence.REL, op: Operator.LEQ };
tokenProps[MathTokenType.GEQ] = { flags: TokenLexFlags.Relop, precedence: TokenPrecedence.REL, op: Operator.GEQ };
tokenProps[MathTokenType.IMPLIES] = { flags: TokenLexFlags.Binop, precedence: TokenPrecedence.IMPLIES, op: Operator.IMPLIES };

const operatorToPrecedence: TokenPrecedence[] = [];
operatorToPrecedence[Operator.IMPLIES] = TokenPrecedence.IMPLIES;
operatorToPrecedence[Operator.EQ] = TokenPrecedence.REL;
operatorToPrecedence[Operator.LEQ] = TokenPrecedence.REL;
operatorToPrecedence[Operator.GEQ] = TokenPrecedence.REL;
operatorToPrecedence[Operator.IN] = TokenPrecedence.IN;
operatorToPrecedence[Operator.MUL] = TokenPrecedence.MUL;
operatorToPrecedence[Operator.DIV] = TokenPrecedence.MUL;
operatorToPrecedence[Operator.ADD] = TokenPrecedence.ADD;
operatorToPrecedence[Operator.SUB] = TokenPrecedence.ADD;
operatorToPrecedence[Operator.UNDER] = TokenPrecedence.EXP;
operatorToPrecedence[Operator.EXP] = TokenPrecedence.EXP;
operatorToPrecedence[Operator.IN] = TokenPrecedence.IN;
operatorToPrecedence[Operator.SETMINUS] = TokenPrecedence.ADD;
operatorToPrecedence[Operator.PLUSMINUS] = TokenPrecedence.ADD;
operatorToPrecedence[Operator.INTERSECTION] = TokenPrecedence.MUL;
operatorToPrecedence[Operator.UNION] = TokenPrecedence.MUL;
operatorToPrecedence[Operator.AND] = TokenPrecedence.LOG;
operatorToPrecedence[Operator.OR] = TokenPrecedence.LOG;
operatorToPrecedence[Operator.CONG] = TokenPrecedence.REL;
operatorToPrecedence[Operator.SUBSETEQ] = TokenPrecedence.IN;
operatorToPrecedence[Operator.SUBSET] = TokenPrecedence.IN;
operatorToPrecedence[Operator.VDASH] = TokenPrecedence.IMPLIES;
operatorToPrecedence[Operator.EQUIV] = TokenPrecedence.REL;
operatorToPrecedence[Operator.OWNS] = TokenPrecedence.IN;
operatorToPrecedence[Operator.NOTIN] = TokenPrecedence.IN;

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

addCommand(mathCmdTree, { key: "partial", arity: 0, exp: true, texString: "\\partial " });
addCommand(mathCmdTree, { key: "neg", arity: 0, texString: "\\neg " });
addCommand(mathCmdTree, { key: "overline", arity: 1, texString: "\\overline{} " });
addCommand(mathCmdTree, { key: "circ", arity: 0, texString: "\\circ " });
addCommand(mathCmdTree, { key: "sin", arity: 0, exp: true, texString: "\\sin " });
addCommand(mathCmdTree, { key: "sqrt", arity: 1, texString: "\\sqrt{} " });
addCommand(mathCmdTree, { key: "to", arity: 0, texString: "\\to " });
addCommand(mathCmdTree, { key: "frac", arity: 2, texString: "\\frac{}{} " });

export function printTokens(tokIndex: number, mathCursor: number, tokens: MathToken[], mathText: string) {
    console.log(`Math indx ${tokIndex} cp ${mathCursor} is`);
    let buf = "";
    for (let i = 0, len = tokens.length; i < len; i++) {
        const tok = tokens[i] as MathCommandToken;
        buf += `${i} [${tok.start}, ${tok.end}): ${MathTokenType[tok.type]} ${mathText.substring(tok.start, tok.end)}`;
        if (tok.endTok) {
            buf += `et: ${tok.endTok.end}`;
        }
        buf += "\n";
    }
    console.log(buf);
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
    let _tokIndex = tokIndex + 1;
    while (_tokIndex < toklen) {
        if ((tokens[_tokIndex].type === MathTokenType.Space) ||
            ((tokens[_tokIndex].type === MathTokenType.Command) &&
                ((tokens[_tokIndex] as MathCommandToken).isModifier))) {
            _tokIndex++;
        } else {
            break;
        }
    }
    return _tokIndex;
}

export interface IMathCursor {
    mathCursor: number;
    mathTokenIndex: number;
}

export interface IMathMarker extends MergeTree.Marker {
    mathTokens: MathToken[];
    mathText: string;
    mathInstance?: IFluidObject;
}

/**
 * This function updates the mathCursor and mathTokenIndex properties of mathMarker
 * @param mathMarker marker for end of math region
 */
export function bksp(mathMarker: IMathMarker, mc: IMathCursor) {
    let prevTokIndex = mathTokRev(mc.mathTokenIndex, mathMarker.mathTokens);
    while ((prevTokIndex >= 0) &&
        ((mathMarker.mathTokens[prevTokIndex].type === MathTokenType.EndCommand) ||
            (mathMarker.mathTokens[prevTokIndex].type === MathTokenType.MidCommand))) {
        prevTokIndex--;
    }
    if (prevTokIndex >= 0) {
        const prevTok = mathMarker.mathTokens[prevTokIndex];
        mc.mathTokenIndex = prevTokIndex;
        mc.mathCursor = prevTok.start;
        if ((prevTok.type === MathTokenType.Command) &&
            (prevTok.cmdInfo.arity > 0)) {
            const prevCommandTok = prevTok as MathCommandToken;
            return { start: prevTok.start, end: prevCommandTok.endTok.end };
        } else if ((prevTok.isSymbol) && (hasSymbolModifiers(prevTok as MathSymbolToken))) {
            return { start: prevTok.start, end: furthestModifierEnd(prevTok as MathSymbolToken) };
        } else {
            return { start: prevTok.start, end: prevTok.end };
        }
    }
}

export function mathTokRev(tokIndex: number, tokens: MathToken[]) {
    let _tokIndex = tokIndex - 1;
    if (_tokIndex > (tokens.length - 1)) {
        _tokIndex = tokens.length - 1;
    }
    while (_tokIndex >= 0) {
        const tok = tokens[_tokIndex];
        if ((tok.type === MathTokenType.Space) ||
            ((tok.type === MathTokenType.Command) &&
                ((tok as MathCommandToken).isModifier))) {
            _tokIndex--;
        } else {
            break;
        }
    }
    if (_tokIndex >= 0) {
        return _tokIndex;
    } else {
        return Nope;
    }
}

export class MathToken {
    // command for which this token ends an operand
    public paramCmd?: MathToken;
    // operand index if paramCmd defined
    public paramIndex?: number;
    public isSymbol?: boolean;
    public text?: string;

    constructor(public type: MathTokenType, public start: number, public end: number,
        public cmdInfo?: IMathCommand) {
    }
}

export class MathSymbolToken extends MathToken {
    public subCmd?: MathCommandToken;
    public superCmd?: MathCommandToken;
    public isSymbol = true;
    public isModifier?: boolean;

    constructor(type: MathTokenType, start: number, end: number,
        public cmdInfo?: IMathCommand) {
        super(type, start, end, cmdInfo);
    }
}

function hasSymbolModifiers(symTok: MathSymbolToken) {
    return symTok.subCmd || symTok.superCmd;
}

function furthestModifierEnd(symTok: MathSymbolToken) {
    if (symTok.subCmd) {
        if (symTok.superCmd) {
            return Math.max(symTok.subCmd.endTok.end, symTok.superCmd.endTok.end);
        } else {
            return symTok.subCmd.endTok.end;
        }
    } else {
        return symTok.superCmd.endTok.end;
    }
}

export class MathCommandToken extends MathSymbolToken {
    // the number of operands seen so far
    public paramRefRemaining?: number;
    // the token ending the last operand
    public endTok?: MathToken;
    // the tokens starting each parameter
    public paramStarts: MathToken[];
    public symbolModified?: MathSymbolToken;

    constructor(type: MathTokenType, start: number, end: number,
        public cmdInfo?: IMathCommand) {
        super(type, start, end, cmdInfo);
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
            case CharacterCodes.cr:
                // AF: restrict to top-level (pass into this function whether top-level)
                return "\n";
            default:
        }
    }
}

interface ICharStream {
    chars: string;
    index: number;
}

const eoc = Nope;

function charStreamPeek(charStream: ICharStream) {
    return charStreamGet(charStream, false);
}

function charStreamAdvance(charStream: ICharStream, amt = 1) {
    charStream.index += amt;
    if (charStream.index > charStream.chars.length) {
        charStream.index = charStream.chars.length;
    }
}

function charStreamRetreat(charStream: ICharStream, amt: number) {
    charStream.index -= amt;

    if (charStream.index < 0) {
        charStream.index = 0;
    }
}

function charStreamGet(charStream: ICharStream, advance = true) {
    const charsLen = charStream.chars.length;
    if (charStream.index < charsLen) {
        const ch = charStream.chars.charCodeAt(charStream.index);
        if (advance) {
            charStream.index++;
        }
        return ch;
    } else {
        return eoc;
    }
}

function charStreamSubstring(start: number, charStream: ICharStream) {
    return charStream.chars.substring(start, charStream.index);
}

function isDecimalDigit(c: number): boolean {
    return c >= CharacterCodes._0 && c <= CharacterCodes._9;
}

function isVariableChar(c: number): boolean {
    return (c >= CharacterCodes.a && c <= CharacterCodes.z) ||
        (c >= CharacterCodes.A && c <= CharacterCodes.Z);
}

// assumes char stream points at first character in identifier
function lexId(charStream: ICharStream): string {
    const startOffset = charStream.index;
    let ch: number;
    do {
        ch = charStreamGet(charStream);
    } while (isVariableChar(ch));
    if (ch !== eoc) {
        charStreamRetreat(charStream, 1);
    }
    return charStreamSubstring(startOffset, charStream);
}

function lexCommand(tokens: MathToken[], charStream: ICharStream, cmdStack: MathToken[]) {
    const startPos = charStream.index;
    charStreamAdvance(charStream); // skip the backslash
    const key = lexId(charStream);
    let tokenType = MathTokenType.Command;
    const cmd = mathCmdTree.get(key);
    if (cmd.tokenType !== undefined) {
        tokenType = cmd.tokenType;
    }
    if (cmd.arity > 0) {
        // consume the "{"
        charStreamAdvance(charStream);
    }
    const tok = new MathCommandToken(tokenType, startPos, charStream.index, cmd);
    tokens.push(tok);
    if (cmd.arity > 0) {
        tok.paramRefRemaining = cmd.arity;
        cmdStack.push(tok);
    }
    return tok;
}

export function lexSpace(tokens: MathToken[], charStream: ICharStream) {
    const startPos = charStream.index;
    let c = charStreamPeek(charStream);
    while (c === CharacterCodes.space) {
        charStreamAdvance(charStream);
        c = charStreamPeek(charStream);
    }
    if (startPos < charStream.index) {
        tokens.push(new MathToken(MathTokenType.Space, startPos, charStream.index));
    }
}

// chars not recognized as math input (such as "!") stopped
// at input filter level and not expected
function lexCharStream(charStream: ICharStream, tokens: MathToken[],
    cmdStack: MathCommandToken[]) {
    let prevSymTok: MathSymbolToken;

    function modSymTok(curTok: MathCommandToken, isSub = true) {
        if (prevSymTok) {
            let symTok = prevSymTok;
            if (prevSymTok.isModifier) {
                symTok = (symTok as MathCommandToken).symbolModified;
            }
            if (isSub) {
                symTok.subCmd = curTok;
            } else {
                symTok.superCmd = curTok;
            }
            curTok.symbolModified = symTok;
        }
    }

    function lexEq(): MathToken {
        const pos = charStream.index;
        // first character is '='
        charStreamAdvance(charStream);
        const nextChar = charStreamPeek(charStream);
        if (nextChar === CharacterCodes.greaterThan) {
            // recognized an '=>'
            charStreamAdvance(charStream);
            return new MathToken(MathTokenType.IMPLIES, pos, pos + 2);
        } else {
            // recognized "="
            return new MathToken(MathTokenType.Equals, pos, pos + 1);
        }
    }

    // reals also
    function lexNumber(): MathToken {
        const start = charStream.index;
        let ch: number;
        do {
            ch = charStreamGet(charStream);
        } while (isDecimalDigit(ch));
        if (ch !== eoc) {
            charStreamRetreat(charStream, 1);
        }
        const numString = charStreamSubstring(start, charStream);
        const tok = new MathToken(MathTokenType.INT, start, charStream.index);
        tok.text = numString;
        return tok;
    }

    let c = charStreamPeek(charStream);
    while (c !== eoc) {
        // single character variables (unless preceded by '?')
        if (isVariableChar(c)) {
            const start = charStream.index;
            charStreamAdvance(charStream);
            const vartok = new MathSymbolToken(MathTokenType.Variable,
                start, charStream.index);
            prevSymTok = vartok;
            vartok.text = charStreamSubstring(start, charStream);
            if (charStreamPeek(charStream) === CharacterCodes.colon) {
                // it's a pattern variable!
                vartok.type = MathTokenType.PatternVariable;
            }
            tokens.push(vartok);
        } else if (isDecimalDigit(c)) {
            tokens.push(lexNumber());
        } else {
            switch (c) {
                case CharacterCodes.backslash:
                    const cmdTok = lexCommand(tokens, charStream, cmdStack);
                    if ((cmdTok.type === MathTokenType.Variable) ||
                        (cmdTok.cmdInfo && (cmdTok.cmdInfo.arity === 0))) {
                        prevSymTok = cmdTok;
                    }
                    break;
                case CharacterCodes.equals:
                    tokens.push(lexEq());
                    break;
                case CharacterCodes.slash:
                    tokens.push(new MathToken(MathTokenType.DIV, charStream.index, charStream.index + 1));
                    charStreamAdvance(charStream);
                    break;
                case CharacterCodes.plus:
                    tokens.push(new MathToken(MathTokenType.ADD, charStream.index, charStream.index + 1));
                    charStreamAdvance(charStream);
                    break;
                case CharacterCodes.comma:
                    tokens.push(new MathToken(MathTokenType.COMMA, charStream.index, charStream.index + 1));
                    charStreamAdvance(charStream);
                    break;
                case CharacterCodes.minus:
                    tokens.push(new MathToken(MathTokenType.SUB, charStream.index, charStream.index + 1));
                    charStreamAdvance(charStream);
                    break;
                case CharacterCodes.caret: {
                    const pos = charStream.index;
                    const tok = new MathCommandToken(MathTokenType.Command, pos, pos + 2, superCmd);
                    tok.paramRefRemaining = 1;
                    tok.isModifier = true;
                    cmdStack.push(tok);
                    modSymTok(tok, false);
                    tokens.push(tok);
                    charStreamAdvance(charStream, 2);
                    break;
                }
                case CharacterCodes._: {
                    const pos = charStream.index;
                    const tok = new MathCommandToken(MathTokenType.Command, pos, pos + 2, subCmd);
                    tok.paramRefRemaining = 1;
                    tok.isModifier = true;
                    cmdStack.push(tok);
                    modSymTok(tok);
                    tokens.push(tok);
                    charStreamAdvance(charStream, 2);
                    break;
                }
                case CharacterCodes.openBrace:
                    console.log(`shouldn't see { at pos ${charStream.index})`);
                    printTokens(0, 0, tokens, charStream.chars);
                    charStreamAdvance(charStream);
                    break;
                case CharacterCodes.closeBrace: {
                    const start = charStream.index;
                    let tokenType = MathTokenType.RCurly;
                    let cmd: MathCommandToken;
                    if (cmdStack.length > 0) {
                        cmd = cmdStack[cmdStack.length - 1];
                        if (cmd.paramRefRemaining > 1) {
                            charStreamAdvance(charStream); // consume the following "{"
                            tokenType = MathTokenType.MidCommand;
                        }
                    }
                    charStreamAdvance(charStream);
                    const tok = new MathToken(tokenType, start, charStream.index);
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
                case CharacterCodes.openParen:
                    tokens.push(new MathToken(MathTokenType.OPAREN, charStream.index,
                        charStream.index + 1));
                    charStreamAdvance(charStream);
                    break;
                case CharacterCodes.closeParen:
                    tokens.push(new MathToken(MathTokenType.CPAREN, charStream.index,
                        charStream.index + 1));
                    charStreamAdvance(charStream);
                    break;
                case CharacterCodes.space:
                    lexSpace(tokens, charStream);
                    break;
                case CharacterCodes.linefeed:
                    tokens.push(new MathToken(MathTokenType.Newline, charStream.index,
                        charStream.index + 1));
                    charStreamAdvance(charStream);
                    break;
                case eoc:
                    break;
                case CharacterCodes.question: {
                    charStreamAdvance(charStream);
                    const start = charStream.index;
                    const vartext = lexId(charStream);
                    const vartok = new MathToken(MathTokenType.PatternVariable,
                        start, charStream.index);
                    vartok.text = vartext;
                    tokens.push(vartok);
                    break;
                }
                case CharacterCodes.colon: {
                    charStreamAdvance(charStream);
                    const start = charStream.index;
                    const varTypeText = lexId(charStream);
                    const vartok = new MathToken(MathTokenType.PatternType,
                        start, charStream.index);
                    vartok.text = varTypeText;
                    tokens.push(vartok);
                    break;
                }
                default:
                    const ch = charStream.chars.charAt(charStream.index);
                    console.log(`shouldn't see ${ch} at pos ${charStream.index})`);
                    printTokens(0, 0, tokens, charStream.chars);
                    charStreamAdvance(charStream);
            }
        }
        c = charStreamPeek(charStream);
    }
    return tokens;
}

export function lexMath(mathBuffer: string) {
    return lexCharStream({ chars: mathBuffer, index: 0 }, [] as MathToken[], [] as MathCommandToken[]);
}

interface ITokenStream {
    text: string;
    tokens: MathToken[];
    index: number;
    end: number;
}

function tokStreamPeek(tokStream: ITokenStream) {
    return tokStreamGet(tokStream, false);
}

export function tokStreamAtEOI(tokStream: ITokenStream) {
    let tokenEndIndex = tokStream.tokens.length;
    if (tokStream.end >= 0) {
        tokenEndIndex = tokStream.end;
    }
    return (tokenEndIndex === tokStream.index);
}

function tokStreamAdvance(tokStream: ITokenStream) {
    tokStreamGet(tokStream, true);
}

function tokStreamGet(tokStream: ITokenStream, advance = true): MathToken {
    let tokenEndIndex = tokStream.tokens.length;
    if (tokStream.end >= 0) {
        tokenEndIndex = tokStream.end;
    }
    if (tokStream.index < tokenEndIndex) {
        const tok = tokStream.tokens[tokStream.index];
        if (advance) {
            tokStream.index++;
        }
        return tok;
    } else {
        return { end: Nope, start: Nope, type: MathTokenType.EOI };
    }
}

function tokStreamCreateFromRange(text: string, tokens: MathToken[], start: number, end: number) {
    return { text, tokens, index: start, end };
}

function tokStreamCreate(text: string, tokens: MathToken[], filter = true) {
    let _tokens = tokens;
    if (filter) {
        _tokens = _tokens.filter((v) => v.type !== MathTokenType.Space);
    }
    return tokStreamCreateFromRange(text, _tokens, 0, Nope);
}

export enum ExprType {
    INTEGER,
    RATIONAL,
    REAL,
    VARIABLE,
    PATTERNVAR,
    BINOP,
    UNOP,
    TUPLE,
    CALL,
    ERROR,
}
namespace Constants {
    export function matchConstant(c: IConstant, e: IExpr) {
        if (isConstant(e)) {
            const prom = promote(c, e as IConstant);
            if (prom.c1.type === ExprType.RATIONAL) {
                const r1 = prom.c1 as IRational;
                const r2 = prom.c2 as IRational;
                return (r1.a === r2.a) && (r1.b === r2.b);
            } else {
                return (prom.c1 as IReal).value === (prom.c2 as IReal).value;
            }
        }
        return false;
    }

    export function makeInt(n: number): IReal {
        return { type: ExprType.INTEGER, value: n };
    }

    export function rationalOp(op: Operator, r1: IRational, r2: IRational) {
        const l = lcd(r1, r2);
        const _r1 = l.r1;
        const _r2 = l.r2;
        switch (op) {
            case Operator.ADD:
                return { type: ExprType.RATIONAL, a: _r1.a + _r2.a, b: _r1.b };
            case Operator.SUB:
                return { type: ExprType.RATIONAL, a: _r1.a - _r2.a, b: _r1.b };
            case Operator.MUL:
                return simplifyRational({ type: ExprType.RATIONAL, a: _r1.a * _r2.a, b: _r1.b * _r1.b });
            case Operator.DIV:
                return simplifyRational({ type: ExprType.RATIONAL, a: _r1.a * _r2.b, b: _r1.b * _r2.a });
            case Operator.EXP:
                if (_r2.b === 1) {
                    return simplifyRational({ type: ExprType.RATIONAL, a: Math.pow(_r1.a, _r2.a), b: Math.pow(_r1.b, _r2.a) });
                } else if ((_r2.a % _r2.b) === 0) {
                    const exp = _r2.a / _r2.b;
                    return simplifyRational({ type: ExprType.RATIONAL, a: Math.pow(_r1.a, exp), b: Math.pow(_r1.b, exp) });
                } else {
                    // punt to real
                    return ({ type: ExprType.REAL, value: Math.pow(_r1.a / _r1.b, _r2.a / _r2.b) });
                }
            default:
        }
    }

    export function negate(c: IConstant): IConstant {
        if (c.type === ExprType.RATIONAL) {
            const r = c as IRational;
            const rat: IRational = { type: ExprType.RATIONAL, a: -r.a, b: r.b };
            return rat;
        } else {
            const real = c as IReal;
            return { type: c.type, value: -real.value };
        }
    }

    export function isNegative(c: IConstant): boolean {
        if (c.type === ExprType.RATIONAL) {
            const r = c as IRational;
            return ((r.a < 0) && (r.b > 0)) || ((r.a > 0) && (r.b < 0));
        } else {
            const real = c as IReal;
            return real.value < 0;
        }
    }

    // update to handle negative integers and rationals
    function gcd(a: number, b: number): number {
        if (b === 0) {
            return a;
        } else if (a === 0) {
            return b;
        } else {
            return gcd(b, a % b);
        }
    }

    function lcm(k1: number, k2: number) {
        return (Math.abs(k1 * k2) / gcd(k1, k2));
    }

    export function lcd(r1: IRational, r2: IRational) {
        if (r2.b === r1.b) {
            return { r1, r2 };
        } else {
            const d = lcm(r1.b, r2.b);
            let f = d / r1.b;
            let nr1: IRational;
            if (r1.a === 0) {
                nr1 = { type: ExprType.RATIONAL, a: 0, b: d };
            } else {
                nr1 = { type: ExprType.RATIONAL, a: f * r1.a, b: f * r1.b };
            }
            f = d / r2.b;
            let nr2: IRational;
            if (r2.a === 0) {
                nr2 = { type: ExprType.RATIONAL, a: 0, b: d };
            } else {
                nr2 = { type: ExprType.RATIONAL, a: f * r2.a, b: f * r2.b };
            }
            return { r1: nr1, r2: nr2 };
        }
    }

    export function simplifyRational(rat: IRational): IExpr {
        if ((rat.a % rat.b) === 0) {
            return { type: ExprType.INTEGER, value: rat.a / rat.b };
        }
        const d = gcd(rat.a, rat.b);
        if (d === 1) {
            return rat;
        } else {
            const resrat: IRational = { type: ExprType.RATIONAL, a: rat.a / d, b: rat.b / d };
            return resrat;
        }
    }

    export function convertConstant(c: IConstant, type: ExprType): IConstant {
        if (c.type < type) {
            if (c.type === ExprType.INTEGER) {
                if (type === ExprType.REAL) {
                    return { type: ExprType.REAL, value: (c as IReal).value };
                } else {
                    // type == ExprType.RATIONAL
                    const rat: IRational = { type: ExprType.RATIONAL, a: (c as IReal).value, b: 1 };
                    return rat;
                }
            } else if (c.type === ExprType.RATIONAL) {
                // type == ExprType.REAL
                const rat = c as IRational;
                return { type: ExprType.REAL, value: rat.a / rat.b };
            }
        } else {
            return c;
        }
    }

    export function promote(a: IConstant, b: IConstant) {
        if (a.type === b.type) {
            return { c1: a, c2: b };
        } else if (a.type < b.type) {
            return { c1: convertConstant(a, b.type), c2: b };
        } else {
            return { c1: a, c2: convertConstant(b, a.type) };
        }
    }
}

function exprToTexParens(expr: IExpr) {
    return exprToTex(expr, true, TokenPrecedence.NONE, false, true);
}

function isInfix(op: Operator) {
    return (op !== Operator.DIV);
}

function isParamOp(op: Operator) {
    return (op === Operator.EXP) || (op === Operator.UNDER);
}

function exprToTex(expr: IExpr, inputMode = true, prevPrecedence = TokenPrecedence.NONE, left = false, alwaysParens = false): string {
    let tex = expr.pendingParens ? expr.pendingParens : "";
    const showParens = alwaysParens || (inputMode && (expr.parenthesized));
    let op1Tex: string;
    let op2Tex: string;
    switch (expr.type) {
        case ExprType.TUPLE: {
            const tuple = expr as ITuple;
            if (!expr.pendingParens) {
                tex += "(";
            }
            for (let i = 0, len = tuple.elements.length; i < len; i++) {
                if (i > 0) {
                    tex += ",";
                }
                tex += exprToTex(tuple.elements[i], inputMode, TokenPrecedence.MUL,
                    false, alwaysParens);
            }
            if (!expr.pendingParens) {
                tex += ")";
            }
            break;
        }
        case ExprType.BINOP:
            const binex = expr as IBinop;
            const precedence = operatorToPrecedence[binex.op];
            if (isInfix(binex.op)) {
                const paramOp = isParamOp(binex.op);
                op1Tex = exprToTex(binex.operand1, inputMode, precedence, true, alwaysParens);
                let rightPrec = precedence;
                if (paramOp) {
                    rightPrec = TokenPrecedence.NONE;
                }
                op2Tex = exprToTex(binex.operand2, inputMode, rightPrec, false, alwaysParens);
                let parenthesize = showParens;
                if (!parenthesize) {
                    if (left) {
                        parenthesize = (precedence < prevPrecedence) && (!expr.pendingParens);
                    } else {
                        parenthesize = (precedence <= prevPrecedence) && (!expr.pendingParens);
                    }
                }
                if (parenthesize) {
                    tex += "(";
                }
                tex += op1Tex;
                tex += texString[binex.op];
                if (paramOp) {
                    tex += "{";
                }
                tex += op2Tex;
                if (paramOp) {
                    tex += "}";
                }
                if (parenthesize) {
                    tex += ")";
                }
            } else {
                const paramPrec = inputMode ? precedence : TokenPrecedence.NONE;
                op1Tex = exprToTex(binex.operand1, inputMode, paramPrec, false, alwaysParens);
                op2Tex = exprToTex(binex.operand2, inputMode, paramPrec, false, alwaysParens);
                tex += texString[binex.op];
                tex += "{" + op1Tex + "}";
                tex += "{" + op2Tex + "}";
            }
            break;
        case ExprType.UNOP:
            const unex = expr as IUnop;
            tex += "-" + exprToTex(unex.operand1, inputMode, TokenPrecedence.NEG, false, alwaysParens);
            break;
        case ExprType.RATIONAL: {
            const rat = expr as IRational;
            if (Constants.isNegative(rat)) {
                tex += "-";
            }
            tex += "\\frac{" + Math.abs(rat.a).toString() + "}{" + Math.abs(rat.b).toString() + "}";
            break;
        }
        case ExprType.CALL: {
            const ecall = expr as ICall;
            if ((!ecall.notFound) && (!ecall.prefixCmds)) {
                tex += "\\" + ecall.name;
                if (ecall.sub) {
                    tex += "_{" + exprToTex(ecall.sub, inputMode) + "}";
                }
                if (ecall.exp) {
                    tex += "^{" + exprToTex(ecall.exp, inputMode) + "}";
                }
                tex += " ";
                if (ecall.params.length === 1) {
                    if (ecall.curlies) {
                        tex += "{";
                    }
                    tex += exprToTex(ecall.params[0], inputMode);
                    if (ecall.curlies) {
                        tex += "}";
                    }
                }
            } else if (ecall.notFound) {
                tex += "\\class{err}{\\mathrm{\\backslash " + ecall.name + "}}";
            } else {
                tex += "\\mathrm{\\backslash " + ecall.name + "}";
            }
            break;
        }
        case ExprType.INTEGER:
        case ExprType.REAL: {
            const c = expr as IConstant;
            if (c.assignedVar) {
                tex += exprToTex(c.assignedVar, inputMode, prevPrecedence, left, alwaysParens);
            } else {
                tex += (expr as IReal).value;
            }
            break;
        }
        case ExprType.VARIABLE: {
            const vexpr = expr as IVariable;
            tex += vexpr.text;
            if (vexpr.sub) {
                tex += "_{" + exprToTex(vexpr.sub, inputMode, TokenPrecedence.NONE, false, alwaysParens) + "}";
            }
            break;
        }
        case ExprType.PATTERNVAR:
            const pvar = expr as IPatternVar;
            if (pvar.text === "cur") {
                tex += "\\cssId{mcur}{\\cdots}";
            } else {
                tex += "?" + pvar.text + ((pvar.pvarType === PatternVarType.Any) ? "" : (":" + PatternVarType[pvar.pvarType]));
            }
            break;
        default:
    }
    return tex;
}

// for now, object will be fast enough
interface IEnvironment {
    [s: string]: IExpr;
}

function emptyEnvironment() {
    const env: IEnvironment = {};
    return env;
}

function bind(env: IEnvironment, pvarName: string, type: PatternVarType, e: IExpr): boolean {
    if ((type === PatternVarType.Const) && (!isConstant(e))) {
        return false;
    } else if ((type === PatternVarType.Var) && (e.type !== ExprType.VARIABLE)) {
        return false;
    } else if ((type === PatternVarType.Expr) && (isConstant(e))) {
        return false;
    }
    let existing: IExpr;
    if (env) {
        existing = env[pvarName];
    }
    if (existing) {
        return match(existing, e, env, true);
    } else {
        env[pvarName] = e;
        return true;
    }
}

function matchS(p: string, expr: IExpr, env?: IEnvironment): boolean {
    const pattern = parse(p);
    return match(pattern, expr, env);
}

function parse(s: string): IExpr {
    const tokens = lexCharStream({ chars: s, index: 0 }, [], []);
    const parserContext: IParserContext = {};
    return parseExpr(tokStreamCreate(s, tokens), parserContext);
}

const diagMatch = false;
function match(pattern: IExpr, expr: IExpr, env?: IEnvironment, literal = false): boolean {
    if (diagMatch) {
        const texP = exprToTex(pattern);
        const texE = exprToTexParens(expr);
        console.log(`matching ${texP} vs ${texE}`);
    }
    let matched = false;
    if (isConstant(pattern)) {
        matched = Constants.matchConstant(pattern, expr);
        if ((!matched) && diagMatch) {
            console.log("constant match failed");
        }
        return matched;
    }
    switch (pattern.type) {
        case ExprType.PATTERNVAR: {
            const pvar = pattern as IPatternVar;
            matched = bind(env, pvar.text, pvar.pvarType, expr);
            if ((!matched) && diagMatch) {
                console.log("bind failed");
            }
            return matched;
        }
        case ExprType.VARIABLE: {
            if (literal) {
                if (expr.type !== ExprType.VARIABLE) {
                    if (diagMatch) {
                        console.log(`literal variable match failed with expr type ${ExprType[expr.type]}`);
                    }
                    return false;
                } else {
                    const vpat = pattern as IVariable;
                    const vexpr = expr as IVariable;
                    matched = (vpat.text === vexpr.text);
                    if ((!matched) && diagMatch) {
                        console.log("literal variable match failed (2)");
                    }
                    if (matched && vpat.sub) {
                        if (vexpr.sub) {
                            // only literal match of subscript expressions for now
                            matched = match(vpat.sub, vexpr.sub, env, true);
                        } else {
                            matched = false;
                        }
                    }
                    return matched;
                }
            } else {
                matched = bind(env, (pattern as IVariable).text, PatternVarType.Any, expr);
                if ((!matched) && diagMatch) {
                    console.log("bind failed");
                }
                return matched;
            }
        }
        case ExprType.UNOP: {
            const punex = pattern as IUnop;
            if (expr.type === ExprType.UNOP) {
                const eunex = expr as IUnop;
                if (punex.op !== eunex.op) {
                    if (diagMatch) {
                        console.log("unop match failed");
                    }
                    return false;
                } else {
                    return match(punex.operand1, eunex.operand1, env, literal);
                }
            } else if (isConstant(expr)) {
                if (Constants.isNegative(expr)) {
                    const n = Constants.negate(expr);
                    return match(punex.operand1, n, env, literal);
                }
            }
            break;
        }
        case ExprType.BINOP: {
            if (expr.type === ExprType.BINOP) {
                const pbinex = pattern as IBinop;
                const ebinex = expr as IBinop;
                if (pbinex.op !== ebinex.op) {
                    if (diagMatch) {
                        console.log("binop match failed");
                    }
                    return false;
                } else {
                    return match(pbinex.operand1, ebinex.operand1, env) &&
                        match(pbinex.operand2, ebinex.operand2, env);
                }
            }
            break;
        }
        default:
    }
    if (diagMatch) {
        console.log(`type mismatch ${ExprType[pattern.type]} vs ${ExprType[expr.type]}`);
    }
    return false;
}

function isConstant(expr: IExpr) {
    return (expr.type === ExprType.INTEGER) || (expr.type === ExprType.RATIONAL) ||
        (expr.type === ExprType.REAL);
}

function applyBinop(binex: IBinop): IExpr {
    const promoted = Constants.promote(binex.operand1, binex.operand2);
    const c1 = promoted.c1;
    const c2 = promoted.c2;

    if ((c1.type === ExprType.INTEGER) || (c1.type === ExprType.REAL)) {
        const rc1 = (c1 as IReal).value;
        const rc2 = (c2 as IReal).value;

        switch (binex.op) {
            case Operator.ADD:
                return { type: c1.type, value: rc1 + rc2 };
            case Operator.SUB:
                return { type: c1.type, value: rc1 - rc2 };
            case Operator.MUL:
                return { type: c1.type, value: rc1 * rc2 };
            case Operator.DIV:
                if (c1.type === ExprType.INTEGER) {
                    return Constants.simplifyRational({ type: ExprType.RATIONAL, a: rc1, b: rc2 });
                } else {
                    return { type: c1.type, value: rc1 / rc2 };
                }
            case Operator.EXP:
                return { type: c1.type, value: Math.pow(rc1, rc2) };
            default:
                return (binex);
        }
    } else {
        // rational
        return Constants.rationalOp(binex.op, c1 as IRational, c2 as IRational);
    }
}

export function extractFirstVar(s: string) {
    const expr = parse(s);
    let v: IVariable;
    walk(expr, (e) => {
        if (e.type === ExprType.VARIABLE) {
            if (!v) {
                v = e as IVariable;
            }
        }
        return true;
    });
    return v;
}

// assume left and right sides linear in v
// eliminate fractions then simplify both sides
function normalize(eqn: IExpr) {
    let _eqn = eqn;
    const result = buildIfMatch([
        { pattern: "a/b=c/d", template: "ad=bc" },
        { pattern: "a/b=c", template: "a=bc" },
        { pattern: "a=c/d", template: "ad=c" }], _eqn);
    if (result) {
        _eqn = result;
    }
    return simplifyExpr(_eqn);
}

// asume binex is a product
export function mulExprNoVar(env: IEnvironment, factor = 1): boolean {
    const origExpr: IExpr = env.f;
    let expr = origExpr;
    const v = env.v as IVariable;
    while (expr.type === ExprType.BINOP) {
        const binex = expr as IBinop;
        if (match(v, binex.operand2, env, true)) {
            return false;
        }
        expr = binex.operand1;
    }
    if (!match(v, expr, env, true)) {
        if (factor !== 1) {
            const resBinex: IBinop = {
                type: ExprType.BINOP, op: Operator.MUL,
                operand1: Constants.makeInt(-1), operand2: origExpr,
            };
            env.nf = resBinex;
        } else {
            env.nf = origExpr;
        }
        return true;
    }
    return false;
}

function walk(expr: IExpr, pre: (e: IExpr) => boolean, post?: (e: IExpr) => void) {
    if ((!pre) || pre(expr)) {
        switch (expr.type) {
            case ExprType.TUPLE: {
                const tuple = expr as ITuple;
                for (let i = 0, len = tuple.elements.length; i < len; i++) {
                    walk(tuple.elements[i], pre, post);
                }
                break;
            }
            case ExprType.BINOP: {
                walk((expr as IBinop).operand1, pre, post);
                walk((expr as IBinop).operand2, pre, post);
                break;
            }
            case ExprType.UNOP: {
                walk((expr as IUnop).operand1, pre, post);
                break;
            }
            case ExprType.CALL: {
                // sub, super as well
                const callExpr = expr as ICall;
                if (callExpr.params) {
                    for (let j = 0, clen = callExpr.params.length; j < clen; j++) {
                        walk(callExpr.params[j], pre, post);
                    }
                }
            }
            default:
            // console.log(`walk encountered expr type ${ExprType[expr.type]}`);
        }
        if (post) {
            post(expr);
        }
    }
}

function extractTermAndDegree(term: IBinop, negate: boolean, v: IVariable) {
    if (diagAC) {
        const tex = exprToTexParens(term);
        console.log(`extract term with negate ${negate}: ${tex}`);
    }
    let constPart: IExpr;
    let symbolPart: IExpr;
    let degree = 0;
    if (negate) {
        constPart = Constants.makeInt(-1);
    }
    walk(term, (e) => {
        if (isConstant(e)) {
            if (constPart) {
                constPart = applyBinop({ type: ExprType.BINOP, op: Operator.MUL, operand1: constPart, operand2: e });
            } else {
                constPart = e;
            }
        } else if (e.type === ExprType.VARIABLE) {
            if ((e as IVariable).text === v.text) {
                degree++;
            } else {
                if (symbolPart) {
                    const binex: IBinop = { type: ExprType.BINOP, op: Operator.MUL, operand1: symbolPart, operand2: e };
                    symbolPart = simplifyExpr(binex);
                } else {
                    symbolPart = e;
                }
            }
        } else if ((e.type === ExprType.BINOP) && ((e as IBinop).op === Operator.EXP)) {
            const binex = e as IBinop;
            if (binex.operand1.type === ExprType.VARIABLE) {
                if ((binex.operand1 as IVariable).text === v.text) {
                    degree += (binex.operand2 as IReal).value;
                } else {
                    if (symbolPart) {
                        const sbinex: IBinop = {
                            type: ExprType.BINOP, op: Operator.MUL,
                            operand1: symbolPart, operand2: e,
                        };
                        symbolPart = simplifyExpr(sbinex);
                    } else {
                        symbolPart = e;
                    }
                }
            } else {
                console.log("need a variable as lhs of exponent");
            }
            return false;
        }
        return true;
    });
    const outTerm: ISplitTerm = {};
    if (symbolPart) {
        if (constPart) {
            const binex: IBinop = {
                type: ExprType.BINOP, op: Operator.MUL, operand1: constPart, operand2: symbolPart,
            };
            outTerm.symbolPart = binex;
        } else {
            outTerm.symbolPart = symbolPart;
        }
    } else {
        outTerm.constPart = constPart;
    }

    return {
        splitTerm: outTerm,
        degree,
    };
}

interface ISplitTerm {
    constPart?: IExpr;
    symbolPart?: IExpr;
}

function extractVarCoeff(expr: IExpr, v: IVariable, negate: boolean, degree: number) {
    let outDegree = 0;
    const term: ISplitTerm = {};
    if ((expr as IVariable).text === v.text) {
        outDegree = degree;
        if (negate) {
            term.constPart = Constants.makeInt(-1);
        } else {
            term.constPart = Constants.makeInt(1);
        }
    } else {
        if (negate) {
            const unex: IUnop = { type: ExprType.UNOP, op: Operator.SUB, operand1: expr };
            term.symbolPart = unex;
        } else {
            term.symbolPart = expr;
        }
    }
    return {
        degree: outDegree,
        splitTerm: term,
    };
}

const diagAC = false;
// convert expression to polynomial coefficient array
// assume sum of products or e1=e2 where e1 and e2 are sum of products
function accumCoefficients(expr: IExpr, v: IVariable, poly: ISplitTerm[], negate: boolean) {
    let term: ISplitTerm = {};
    let degree = 0;

    if (diagAC) {
        const tex = exprToTexParens(expr);
        console.log(`accum coeffs with negate ${negate}: ${tex}`);
    }

    if (isConstant(expr)) {
        term.constPart = expr;
        if (negate) {
            term.constPart = Constants.negate(term.constPart as IConstant);
        }
    } else {
        switch (expr.type) {
            case ExprType.UNOP: {
                const unex = expr as IUnop;
                const _negate = !negate;
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                return accumCoefficients(unex.operand1, v, poly, _negate);
            }
            case ExprType.VARIABLE: {
                // bare v term
                const td = extractVarCoeff(expr, v, negate, 1);
                degree = td.degree;
                term = td.splitTerm;
                break;
            }
            case ExprType.BINOP: {
                const binex = expr as IBinop;
                switch (binex.op) {
                    // expect ADD, SUB, MUL, EQ
                    case Operator.ADD:
                    case Operator.SUB: {
                        accumCoefficients(binex.operand1, v, poly, negate);
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                        return accumCoefficients(binex.operand2, v, poly, binex.op === Operator.SUB ? !negate : negate);
                    }
                    case Operator.EQ: {
                        accumCoefficients(binex.operand1, v, poly, false);
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                        return accumCoefficients(binex.operand2, v, poly, true);
                    }
                    case Operator.MUL: {
                        const td = extractTermAndDegree(binex, negate, v);
                        degree = td.degree;
                        term = td.splitTerm;
                        break;
                    }
                    case Operator.EXP: {
                        if (binex.operand1.type === ExprType.VARIABLE) {
                            if (binex.operand2.type === ExprType.INTEGER) {
                                const td = extractVarCoeff(binex.operand1, v, negate,
                                    (binex.operand2 as IReal).value);
                                degree = td.degree;
                                term = td.splitTerm;
                            } else {
                                console.log("error: non-integer exponent in accum coeffs");
                            }
                        } else {
                            console.log("error: complex lhs of exponent in accum coeffs");
                        }
                        break;
                    }
                    default:
                        console.log(`unexpected operator ${Operator[binex.op]}`);
                }
                break;
            }
            default:
                console.log(`unexpected expr type ${ExprType[expr.type]}`);
        }
    }
    if (poly[degree]) {
        if (term.symbolPart) {
            if (poly[degree].symbolPart) {
                const simplex: IBinop = {
                    type: ExprType.BINOP, op: Operator.ADD,
                    operand1: poly[degree].symbolPart, operand2: term.symbolPart,
                };
                poly[degree].symbolPart = simplifyExpr(simplex);
            } else {
                poly[degree].symbolPart = term.symbolPart;
            }
        }
        if (term.constPart) {
            if (poly[degree].constPart) {
                poly[degree].constPart = applyBinop({ type: ExprType.BINOP, op: Operator.ADD, operand1: poly[degree].constPart, operand2: term.constPart });
            } else {
                poly[degree].constPart = term.constPart;
            }
        }
    } else {
        poly[degree] = term;
    }

    return poly;
}

function extractCoefficients(expr: IExpr, v: IVariable) {
    const polySplit: ISplitTerm[] = [];
    const poly: IExpr[] = [];
    accumCoefficients(expr, v, polySplit, false);
    for (let i = 0, len = polySplit.length; i < len; i++) {
        const splitTerm = polySplit[i];
        if (splitTerm) {
            if (splitTerm.symbolPart) {
                poly[i] = splitTerm.symbolPart;
                if (splitTerm.constPart) {
                    const binex: IBinop = {
                        type: ExprType.BINOP, op: Operator.ADD,
                        operand1: poly[i], operand2: splitTerm.constPart,
                    };
                    poly[i] = binex;
                }
            } else {
                poly[i] = splitTerm.constPart;
            }
        } else {
            poly[i] = Constants.makeInt(0);
        }
    }
    return poly;
}

export function solve(eqn: IExpr, v: IVariable): IExpr {
    const norm = normalize(eqn);
    if (!isSumOfProducts(norm)) {
        return norm;
    }
    const poly = extractCoefficients(norm, v);
    if (poly[0]) {
        if (poly[1]) {
            if (Constants.matchConstant(Constants.makeInt(0), poly[1])) {
                return undefined;
            } else {
                const op1Binex: IBinop = {
                    type: ExprType.BINOP, op: Operator.MUL, operand1: Constants.makeInt(-1),
                    operand2: poly[0],
                };
                const simplex: IBinop = {
                    type: ExprType.BINOP, op: Operator.DIV, operand1: op1Binex,
                    operand2: poly[1],
                };
                const binex: IBinop = {
                    type: ExprType.BINOP, op: Operator.EQ, operand1: v, operand2:
                        simplifyExpr(simplex),
                };
                return binex;
            }
        }
    } else {
        const binex: IBinop = { type: ExprType.BINOP, op: Operator.EQ, operand1: v, operand2: Constants.makeInt(0) };
        return binex;
    }
}

function isInt(e: IExpr, val?: number) {
    return (e.type === ExprType.INTEGER) && ((!val) || ((e as IReal).value === val));
}

function subst(e: IExpr, env: IEnvironment) {
    let evar: IExpr;
    switch (e.type) {
        case ExprType.VARIABLE:
        case ExprType.PATTERNVAR: {
            evar = env[(e as IVariable).text];
            if (evar) {
                return evar;
            }
            break;
        }
        case ExprType.UNOP: {
            const unex = e as IUnop;
            return { type: ExprType.UNOP, op: unex.op, operand1: subst(unex.operand1, env) };
        }
        case ExprType.BINOP: {
            const binex = e as IBinop;
            return {
                type: ExprType.BINOP, op: binex.op, operand1: subst(binex.operand1, env),
                operand2: subst(binex.operand2, env),
            };
        }
        default:
        // console.log(`unrecognized expr type ${e.type}`);
    }
    return e;
}

function buildExpr(s: string, env: IEnvironment) {
    const template = parse(s);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return subst(template, env);
}

interface ITransformString {
    pattern: string;
    template: string;
    param?: any;
    exec?(env: IEnvironment, arg?: any): boolean;
}

interface IMatchInfo {
    index?: number;
    pat?: string;
}

const bifMatchDiag = false;

function buildIfMatch(pats: ITransformString[], e: IExpr, seedEnv?: () => IEnvironment, info?: IMatchInfo): IExpr {
    let env: IEnvironment;
    for (let i = 0, len = pats.length; i < len; i++) {
        if (seedEnv) {
            env = seedEnv();
        } else {
            env = {};
        }
        if (matchS(pats[i].pattern, e, env)) {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            if ((!pats[i].exec) || (pats[i].exec(env, pats[i].param))) {
                if (info) {
                    info.index = i;
                    info.pat = pats[i].pattern;
                }
                const built = buildExpr(pats[i].template, env);
                if (bifMatchDiag) {
                    const builtTex = exprToTex(built);
                    const etex = exprToTex(e);
                    console.log(`applied ${pats[i].pattern} to ${etex} yielding ${builtTex}`);
                }
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                return built;
            }
        }
    }
    return undefined;
}

function foldConstants(env: IEnvironment, opArg: { op: Operator; reverse?: boolean }) {
    const ca = env.a as IConstant;
    const cb = env.b as IConstant;
    if (opArg.reverse) {
        env.c = applyBinop({ type: ExprType.BINOP, op: opArg.op, operand1: cb, operand2: ca });
    } else {
        env.c = applyBinop({ type: ExprType.BINOP, op: opArg.op, operand1: ca, operand2: cb });
    }
    return true;
}

function combineCoeffs(env: IEnvironment, opArg: { sgn: number }) {
    const aLeft = env.al as IConstant;
    const aRight = env.ar as IConstant;
    let bLeft = env.bl as IConstant;
    let bRight = env.br as IConstant;

    // aLeft * x +/- bLeft = aRight * x +/- bRight;
    // sgn 00: -,-; 01: -,+; 10: +,-; 11: +,+
    // (aLeft-aRight) * x  = bRight-bLeft;
    const sgn = opArg.sgn;
    if ((sgn & 0x1) === 0) {
        bRight = Constants.negate(bRight);
    }
    if ((sgn & 0x2) === 0) {
        bLeft = Constants.negate(bLeft);
    }
    env.as = applyBinop({ type: ExprType.BINOP, op: Operator.SUB, operand1: aLeft, operand2: aRight });
    env.bs = applyBinop({ type: ExprType.BINOP, op: Operator.SUB, operand1: bRight, operand2: bLeft });
    return true;
}

function negateConstantIfNegative(env: IEnvironment) {
    const cb = env.b as IConstant;
    if (Constants.isNegative(cb)) {
        env.n = Constants.negate(cb);
        return true;
    } else {
        return false;
    }
}

export function negateConstant(env: IEnvironment) {
    const cb = env.b as IConstant;
    env.n = Constants.negate(cb);
    return true;
}

export function divrl(env: IEnvironment) {
    const a = env.a;
    const b = env.b;

    if (isInt(a, 0)) {
        return false;
    } else {
        const q = applyBinop({ type: ExprType.BINOP, op: Operator.DIV, operand1: b, operand2: a });
        env.q = q;
        return true;
    }
}
// const | var | -factor | var^integer
function isFactor(expr: IExpr) {
    if ((expr.type === ExprType.VARIABLE) || isConstant(expr)) {
        return true;
    }
    if (expr.type === ExprType.UNOP) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return isFactor((expr as IUnop).operand1);
    } else if (expr.type === ExprType.BINOP) {
        const binex = expr as IBinop;
        if (binex.op === Operator.EXP) {
            return (binex.operand1.type === ExprType.VARIABLE) &&
                (binex.operand2.type === ExprType.INTEGER);
        }
    }
    return false;
}

// ab | -a | factor
function isTerm(e: IExpr): boolean {
    if (e.type === ExprType.BINOP) {
        const binex = e as IBinop;
        if (binex.op === Operator.MUL) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return isTerm(binex.operand1) && (isFactor(binex.operand2));
        }
    } else if (e.type === ExprType.UNOP) {
        return isTerm((e as IUnop).operand1);
    } else {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return isFactor(e);
    }
}

function isSumOfProducts(e: IExpr): boolean {
    switch (e.type) {
        case ExprType.BINOP: {
            const binex = e as IBinop;
            if (binex.op === Operator.EQ) {
                return isSumOfProducts(binex.operand1) && isSumOfProducts(binex.operand2);
            }
            if ((binex.op === Operator.ADD) || (binex.op === Operator.SUB)) {
                return isSumOfProducts(binex.operand1) && (isSumOfProducts(binex.operand2));
            } else if (binex.op === Operator.MUL) {
                return isTerm(binex);
            } else if (binex.op === Operator.EXP) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                return isFactor(binex);
            }
        }
        case ExprType.UNOP: {
            return isSumOfProducts(e);
        }
        default:
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return isFactor(e);
    }
}

const diagB = false;
// find correct place to check for divide by zero
function simplifyExpr(expr: IExpr): IExpr {
    let _expr = expr;
    let delta = true;
    while (delta) {
        delta = false;
        if (diagB) {
            const tex = exprToTexParens(_expr);
            console.log(`simplifying ${tex}`);
        }
        let operand1: IExpr;
        let operand2: IExpr;
        switch (_expr.type) {
            case ExprType.INTEGER:
            case ExprType.REAL:
            case ExprType.VARIABLE:
                return _expr;
            case ExprType.RATIONAL:
                return Constants.simplifyRational(_expr as IRational);
            case ExprType.UNOP: {
                // currently only unary '-'
                const unex = _expr as IUnop;
                if (isConstant(unex.operand1)) {
                    return Constants.negate(unex.operand1);
                } else {
                    operand1 = simplifyExpr(unex.operand1);
                    if (operand1 !== unex.operand1) {
                        delta = true;
                        const op1Unex: IUnop = { type: ExprType.UNOP, op: unex.op, operand1 };
                        _expr = op1Unex;
                    }
                }
                break;
            }
            case ExprType.BINOP:
                const binex = _expr as IBinop;
                if (isConstant(binex.operand1)) {
                    if (isConstant(binex.operand2)) {
                        return applyBinop(binex);
                    }
                }
                const info: IMatchInfo = { index: -1 };
                const result = buildIfMatch([
                    // multiplicative identity
                    { pattern: "1a", template: "a" },
                    { pattern: "a1", template: "a" },
                    { pattern: "a/1", template: "a" },
                    { pattern: "0/a", template: "0" },
                    { pattern: "-b:const", template: "?n", exec: negateConstantIfNegative },
                    { pattern: "a--b", template: "a+b" },
                    { pattern: "a-?b:const", template: "a+?n", exec: negateConstantIfNegative },
                    { pattern: "a+?b:const", template: "a-?n", exec: negateConstantIfNegative },
                    { pattern: "a-?b:const?c", template: "a+?n?c", exec: negateConstantIfNegative },
                    // commutative multiplication
                    { pattern: "a(bc)", template: "(ab)c" },
                    // distributive property
                    { pattern: "a(b+c)", template: "ab+ac" },
                    { pattern: "a(b-c)", template: "ab-ac" },
                    { pattern: "(a+b)c", template: "ac+bc" },
                    { pattern: "(a-b)c", template: "ac-bc" },
                    // move constants to beginning of term
                    { pattern: "?v:var?c:const", template: "?c?v" },
                    { pattern: "(?ca:const?e:expr)?cb:const", template: "(?ca?cb)?e" },
                    { pattern: "?ca:const(?cb:const?e:expr)", template: "(?ca?cb)?e" },
                    { pattern: "?e:expr?c:const", template: "?c?e" },
                    { pattern: "?ca:const(-?cb:const)", template: "-1?ca?cb" },
                    { pattern: "a(-b)", template: "-1ab" },
                    { pattern: "a+-b", template: "a-b" },
                    { pattern: "a--bc", template: "a+bc" },
                    { pattern: "a--(bc)", template: "a+bc" },
                    { pattern: "a+-bc", template: "a-bc" },
                    { pattern: "a-(b-c)", template: "a+c-b" },
                    { pattern: "-(a-b)", template: "b-a" },
                    { pattern: "a+(b+c)", template: "a+b+c" },
                    { pattern: "a-(b+c)", template: "a-b-c" },
                    { pattern: "a+(b-c)", template: "a+b-c" },
                    { pattern: "-1a", template: "-a" },
                    { pattern: "-a+b", template: "b-a" },
                    // combine like terms
                    { pattern: "?a:const?x+?b:const?x", template: "?c?x", exec: foldConstants, param: { op: Operator.ADD } },
                    { pattern: "?a:const?x-?d:const+?b:const?x", template: "?c?x-?d", exec: foldConstants, param: { op: Operator.ADD } },
                    { pattern: "?e:expr+?a:const+?b:const", template: "?e+?c", exec: foldConstants, param: { op: Operator.ADD } },
                    { pattern: "?e:expr+?a:const-?b:const", template: "?e+?c", exec: foldConstants, param: { op: Operator.SUB } },
                    { pattern: "?e:expr-?a:const+?b:const", template: "?e+?c", exec: foldConstants, param: { op: Operator.SUB, reverse: true } },
                    { pattern: "?e:expr-?a:const-?b:const", template: "?e-?c", exec: foldConstants, param: { op: Operator.ADD } },
                    { pattern: "?a:const+?e:expr-?b:const", template: "?e+?c", exec: foldConstants, param: { op: Operator.SUB } },
                    { pattern: "?a:const+?e:expr+?b:const", template: "?e+?c", exec: foldConstants, param: { op: Operator.ADD } },
                    // combine like terms on both sides
                    { pattern: "?al:const?x-?bl:const=?ar:const?x-?br:const", template: "?as?x=?bs", exec: combineCoeffs, param: { sgn: 0 } },
                    { pattern: "?al:const?x-?bl:const=?ar:const?x+?br:const", template: "?as?x=?bs", exec: combineCoeffs, param: { sgn: 1 } },
                    { pattern: "?al:const?x+?bl:const=?ar:const?x-?br:const", template: "?as?x=?bs", exec: combineCoeffs, param: { sgn: 2 } },
                    { pattern: "?al:const?x+?bl:const=?ar:const?x+?br:const", template: "?as?x=?bs", exec: combineCoeffs, param: { sgn: 3 } },
                ], binex, () => (emptyEnvironment()), info);
                if (result) {
                    if (diagB) {
                        console.log(`match ${info.index}: ${info.pat}`);
                    }
                    delta = true;
                    _expr = result;
                } else {
                    if (diagB) {
                        console.log("no match");
                    }
                    operand1 = simplifyExpr(binex.operand1);
                    operand2 = simplifyExpr(binex.operand2);
                    if ((operand1 !== binex.operand1) || (operand2 !== binex.operand2)) {
                        delta = true;
                        const resBinex: IBinop = { type: ExprType.BINOP, op: binex.op, operand1, operand2 };
                        _expr = resBinex;
                    }
                }
                break;
            case ExprType.CALL:
            case ExprType.ERROR:
                break;
            default:
                console.log(`simplify: unrecognized expr type ${ExprType[_expr.type]}`);
        }
    }
    return _expr;
}

export interface IExpr {
    type: ExprType;
    pendingParens?: string;
    parenthesized?: boolean;
    minChar?: number;
    limChar?: number;
    value?: number;
    text?: string;
    pvarType?: PatternVarType;
    elements?: IExpr[];
    op?: Operator;
}

export interface ITuple extends IExpr {
    elements: IExpr[];
}

interface IUnop extends IExpr {
    op: Operator;
    operand1: IExpr;
}

interface IBinop extends IUnop {
    operand2: IExpr;
}

export interface IConstant extends IExpr {
    assignedVar?: IVariable;
}

interface IReal extends IConstant {
    value: number;
}

interface IRational extends IConstant {
    a: number;
    b: number;
}

interface ICall extends IExpr {
    name: string;
    notFound?: boolean;
    sub?: IExpr;
    exp?: IExpr;
    prefixCmds?: IMathCommand[];
    params: IExpr[];
    curlies?: boolean;
}

export interface IVariable extends IExpr {
    text: string;
    // subscript expression, if any
    sub?: IExpr;
}

enum PatternVarType {
    Const,
    Var,
    Expr,
    Any,
}

// text can be more than one character
// used in patterns that match expressions
export interface IPatternVar extends IVariable {
    pvarType: PatternVarType;
}

function makeErrorExpr(parsedSoFar: number): IExpr {
    return { type: ExprType.ERROR, minChar: parsedSoFar };
}

function getPvarType(tokStream: ITokenStream): PatternVarType {
    const tok = tokStreamPeek(tokStream);
    if (tok.type === MathTokenType.PatternType) {
        tokStreamAdvance(tokStream);
        if (tok.text === "const") {
            return PatternVarType.Const;
        } else if (tok.text === "var") {
            return PatternVarType.Var;
        } else if (tok.text === "expr") {
            return PatternVarType.Expr;
        }
    }
    return PatternVarType.Any;
}

interface IParserContext {
    prevVar?: IVariable;
}

function parseModExpr(tokStream: ITokenStream, ctxt: IParserContext, modTok: MathCommandToken) {
    return parseCall(tokStream, ctxt, modTok);
}
function tryModExpr(tokStream: ITokenStream, ctxt: IParserContext,
    callExpr: ICall, callTok: MathCommandToken) {
    const tok = tokStreamPeek(tokStream);
    if (tok.type === MathTokenType.Command) {
        const cmdTok = tok as MathCommandToken;
        if (cmdTok.isModifier) {
            tokStreamAdvance(tokStream);
            const modExpr = parseModExpr(tokStream, ctxt, cmdTok);
            if (cmdTok === callTok.subCmd) {
                callExpr.sub = modExpr;
            } else {
                callExpr.exp = modExpr;
            }
            return true;
        }
    }
    return false;
}

function parseCall(tokStream: ITokenStream, ctxt: IParserContext,
    callTok: MathCommandToken): ICall {
    const callExpr: ICall = {
        type: ExprType.CALL,
        name: callTok.cmdInfo.key,
        params: [],
    };
    if (tryModExpr(tokStream, ctxt, callExpr, callTok)) {
        tryModExpr(tokStream, ctxt, callExpr, callTok);
    }
    if (callTok.cmdInfo.arity > 0) {
        for (let i = 0; i < callTok.cmdInfo.arity; i++) {
            callExpr.params[i] = parseExpr(tokStream, ctxt);
            const finishTok = tokStreamGet(tokStream);
            if ((finishTok.type !== MathTokenType.MidCommand) && (finishTok.type !== MathTokenType.EndCommand)) {
                console.log(`unexpected token of type ${MathTokenType[finishTok.type]} ends param expr`);
            }
        }
    }
    return callExpr;
}

function parseTupleTail(expr: IExpr, tokStream: ITokenStream, ctxt: IParserContext): IExpr {
    const elements = [expr];
    let tok: MathToken;

    do {
        elements.push(parseExpr(tokStream, ctxt));
        tok = tokStreamGet(tokStream);
    }
    while (tok.type === MathTokenType.COMMA);

    if ((tok.type !== MathTokenType.CPAREN) && (tok.type !== MathTokenType.EOI)) {
        return makeErrorExpr(tok.start);
    } else {
        const tuple: IExpr = { type: ExprType.TUPLE, elements };
        if (tok.type === MathTokenType.EOI) {
            tuple.pendingParens = "(";
        }
        return tuple;
    }
}

function parsePrimary(tokStream: ITokenStream, ctxt: IParserContext): IExpr {
    let tok = tokStreamGet(tokStream);
    let expr: IExpr;

    switch (tok.type) {
        case MathTokenType.OPAREN:
            expr = parseExpr(tokStream, ctxt);
            tok = tokStreamGet(tokStream);
            if (tok.type !== MathTokenType.CPAREN) {
                if (tok.type === MathTokenType.COMMA) {
                    return parseTupleTail(expr, tokStream, ctxt);
                } else if (tok.type === MathTokenType.EOI) {
                    if (expr.pendingParens) {
                        expr.pendingParens += "(";
                    } else {
                        expr.pendingParens = "(";
                    }
                    expr.minChar = tok.start;
                    return expr;
                } else {
                    return makeErrorExpr(tok.start);
                }
            } else {
                expr.parenthesized = true;
                return (expr);
            }
        case MathTokenType.Command: {
            const cmdTok = tok as MathCommandToken;
            const callExpr = parseCall(tokStream, ctxt, cmdTok);
            if (cmdTok.isModifier && ctxt.prevVar) {
                ctxt.prevVar.sub = callExpr;
                ctxt.prevVar = undefined;
            }
            return callExpr;
        }
        case MathTokenType.INT:
            return { type: ExprType.INTEGER, value: parseInt(tok.text, 10), minChar: tok.start };
        case MathTokenType.REAL:
            return { type: ExprType.REAL, value: parseFloat(tok.text), minChar: tok.start };
        case MathTokenType.Variable: {
            const symTok = tok as MathSymbolToken;
            const vexpr: IVariable = {
                type: ExprType.VARIABLE, text: symTok.text,
                minChar: tok.start,
            };
            ctxt.prevVar = vexpr;
            return vexpr;
        }
        case MathTokenType.PatternVariable: {
            const pvarType = getPvarType(tokStream);
            return {
                type: ExprType.PATTERNVAR, text: tok.text,
                pvarType, minChar: tok.start,
            };
        }
        default:
            return makeErrorExpr(tok.start);
    }
}

function parseExpr(tokStream: ITokenStream, ctxt: IParserContext,
    prevPrecedence = TokenPrecedence.NONE): IExpr {
    let tok = tokStreamPeek(tokStream);
    let usub = false;
    if (tok.type === MathTokenType.SUB) {
        // unary minus
        tokStreamAdvance(tokStream);
        usub = true;
    }
    let left = parsePrimary(tokStream, ctxt);
    if (usub) {
        if (isConstant(left)) {
            left = Constants.negate(left as IConstant);
        } else {
            const unop: IUnop = { type: ExprType.UNOP, op: Operator.SUB, operand1: left };
            left = unop;
        }
    }
    tok = tokStreamPeek(tokStream);
    while ((tok.type !== MathTokenType.EOI) && (tok.type !== MathTokenType.CPAREN) &&
        (tok.type !== MathTokenType.COMMA) && (tok.type !== MathTokenType.MidCommand) &&
        (tok.type !== MathTokenType.EndCommand)) {
        const props = tokenProps[tok.type];
        let rightAssoc = false;
        let precedence: TokenPrecedence;
        let realOpToken = true;
        let op: Operator;

        if (tok.type === MathTokenType.Command) {
            const cmdTok = tok as MathCommandToken;
            const cmdInfo = cmdTok.cmdInfo;
            if (cmdInfo && cmdInfo.infix) {
                op = cmdInfo.op;
                precedence = operatorToPrecedence[op];
            } else {
                // treat as impending multiply
                precedence = TokenPrecedence.MUL;
                realOpToken = false;
                op = Operator.MUL;
            }
        } else if (props.flags & TokenLexFlags.Binop) {
            precedence = props.precedence;
            op = props.op;
            rightAssoc = props.rightAssoc;
        } else if (props.flags & TokenLexFlags.PrimaryFirstSet) {
            precedence = TokenPrecedence.MUL;
            realOpToken = false;
            op = Operator.MUL;
        }
        if ((prevPrecedence < precedence) || ((prevPrecedence === precedence) && rightAssoc)) {
            // previous op has weaker precedence
            if (realOpToken) {
                tokStreamAdvance(tokStream);
            }
            const right = parseExpr(tokStream, ctxt, precedence);
            const binex: IBinop = { type: ExprType.BINOP, op, operand1: left, operand2: right };
            left = binex;
        } else {
            return left;
        }
        tok = tokStreamPeek(tokStream);
    }
    return left;
}

function parseEqn(tokStream: ITokenStream): IExpr {
    let ctxt: IParserContext = {};
    const left = parseExpr(tokStream, ctxt, TokenPrecedence.REL);
    const tok = tokStreamGet(tokStream);
    if (tok.type === MathTokenType.Equals) {
        ctxt = {};
        const right = parseExpr(tokStream, ctxt, TokenPrecedence.IMPLIES);
        const binex: IBinop = {
            type: ExprType.BINOP, op: Operator.EQ, operand1: left,
            operand2: right,
        };
        return binex;
    }
}

export function testEqn(s: string, norm = false, vsolve?: IVariable) {
    console.log(`trying ${s} ...`);
    const tokStream = tokStreamCreate(s, lexMath(s));
    let e = parseEqn(tokStream);
    if (e) {
        console.log(`which is ${exprToTexParens(e)}`);
        if (norm) {
            e = normalize(e);
            if (vsolve) {
                e = solve(e, vsolve);
            }
        }
        if (e) {
            const tex = exprToTex(e, false);
            console.log(tex);
        } else if (vsolve) {
            console.log(`no solution for ${vsolve.text}`);
        }
    } else {
        if (vsolve) {
            console.log(`no solution for ${vsolve.text}`);
        }
    }
}
function getLine(s: string, tokenIndex: number, tokens: MathToken[]) {
    let start = 0;
    let end = s.length;
    for (let i = tokenIndex; i < tokens.length; i++) {
        if (tokens[i].type === MathTokenType.Newline) {
            end = tokens[i].start;
            break;
        }
    }
    for (let i = tokenIndex - 1; i >= 0; i--) {
        if (tokens[i].type === MathTokenType.Newline) {
            start = tokens[i].start + 1;
            break;
        }
    }
    const line = s.substring(start, end);
    return line;
}
export function testExprLine(s: string, tokenIndex: number, tokens: MathToken[]) {
    const xvar: IVariable = { text: "x", type: ExprType.VARIABLE };
    const line = getLine(s, tokenIndex, tokens);
    testEqn(line, true, xvar);
}

function equivalent(e: IExpr, soln: IExpr, v: IVariable) {
    let _e = e;
    if ((_e.type !== ExprType.BINOP) || ((_e as IBinop).op !== Operator.EQ)) {
        return false;
    }
    _e = simplifyExpr(_e);
    _e = solve(_e, v);
    const solnEqn = soln as IBinop;
    const eqn = _e as IBinop;
    if (eqn &&
        match(solnEqn.operand1, eqn.operand1, {}, true) &&
        match(solnEqn.operand2, eqn.operand2, {}, true)) {
        return true;
    } else if (eqn &&
        match(solnEqn.operand1, eqn.operand2, {}, true) &&
        match(solnEqn.operand2, eqn.operand1, {}, true)) {
        return true;
    }
    return false;
}

export function matchSolution(line: string, varName: string, varExpr: string) {
    const e = parse(line);
    const v: IVariable = { text: varName, type: ExprType.VARIABLE };
    const soln = parse(varExpr);
    return equivalent(e, soln, v);
}

export function testExpr(s: string) {
    console.log(`trying ${s} ...`);
    const tokStream = tokStreamCreate(s, lexMath(s));
    const ctxt: IParserContext = {};
    const e = parseExpr(tokStream, ctxt);
    const tex = exprToTex(e);
    console.log(tex);
}

export function testNorm() {
    testEqn("3/(2a+1)=4/(a-1)", true);
    testEqn("(5--1)/(2a+1-3)=(1--2)/(a-1)", true);
    testEqn("(-5--1)/(2a+1--3)=(1--2)/(a-1)", true);
    testEqn("5--1=0", true);
    testEqn("(a-b)/(c-d)=(x-y)/(w-z)", true);
    testEqn("3(x+1)=0", true);
    testEqn("3(x+y)=0", true);
    testEqn("(a+b)(x+1)=0", true);
    testEqn("3(x-1)=0", true);
    testEqn("3(x-y)=0", true);
    testEqn("(a+b)(x-1)=0", true);
    testEqn("(5+2)(x+1)=0", true);
    testEqn("(5+2)(x-1)=0", true);
    testEqn("(a-b)(c-d)=0", true);
}

export function testSolve() {
    const a = { type: ExprType.VARIABLE, text: "a" };
    const x = { type: ExprType.VARIABLE, text: "x" };
    // testEqn("x+x+5x-3=2x-2", true, x);
    // testEqn("x-3+5x+x=2x-1-1",true, x);
    testEqn("x-d-3+c-yx+zx=2x-2", true, x);
    testEqn("6-6a=4a+8", true, a);
    testEqn("4a+16=14a-14", true, a);
    testEqn("4a-16=14a-14", true, a);
    testEqn("2a+1=2a-1", true, a);
    testEqn("3/(2a+1)=4/(a-1)", true, a);
    testEqn("(5--1)/(2a+1-3)=(1--2)/(a-1)", true, a);
    testEqn("(-5--1)/(2a+1-3)=(1--2)/(a-1)", true, a);
    testEqn("3xy-5=0", true, x);
    testEqn("x3-5=0", true, x);
    testEqn("3yx-5=0", true, x);
    testEqn("3yx=0", true, x);
    testEqn("x+x+5x=2x-2", true, x);
    testEqn("x+x+5x-3=2x-2", true, x);
}

function testLCDPair(a1: number, b1: number, a2: number, b2: number) {
    const rr = Constants.lcd({ type: ExprType.RATIONAL, a: a1, b: b1 },
        { type: ExprType.RATIONAL, a: a2, b: b2 });
    let tex = exprToTex(rr.r1);
    console.log(tex);
    tex = exprToTex(rr.r2);
    console.log(tex);
}

export function testLCD() {
    testLCDPair(2, 3, 5, 12);
    testLCDPair(1, 5, 0, 1);
}

export function testMatch() {
    let env: IEnvironment = {};
    let eout: IExpr;
    let tex: string;

    let e = parse("(6-6a)+(-4a)");
    if (!matchS("a+-bc", e, env)) {
        console.log("hmm...");
    }

    e = parse("2y-(3x-7)");
    env = {};

    if (matchS("a-(b-c)", e, env)) {
        eout = buildExpr("a+c-b", env);
        tex = exprToTex(eout);
        console.log(tex);
    } else {
        console.log("hmmm...");
    }
    e = parse("x4");
    env = {};
    if (matchS("?v:var?c:const", e, env)) {
        eout = buildExpr("?c?v", env);
        tex = exprToTex(eout);
        console.log(tex);
    } else {
        console.log("(1) hmmm...");
    }
    e = parse("ac-ad-(bc-bd)");
    env = {};
    if (matchS("a-(b-c)", e, env)) {
        eout = buildExpr("a+c-b", env);
        tex = exprToTex(eout);
        console.log(tex);
    } else {
        console.log("(2) hmmm...");
    }

    // e = parse("1x");
    e = parse("(3)(1)");
    env = {};
    const result = buildIfMatch([
        { pattern: "1a", template: "a" },
        { pattern: "a1", template: "a" }], e);

    if (result) {
        tex = exprToTex(result);
        console.log(tex);
    } else {
        console.log("(3) hmmm...");
    }
}

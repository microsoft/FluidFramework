// TODO convert me
// tslint:disable

import * as PrefixTree from './prefixTree';

namespace Maths {
    enum CharacterCodes {
        _ = 95,
        $ = 36,

        ampersand = 38,             // &
        asterisk = 42,              // *
        at = 64,                    // @
        backslash = 92,             // \
        bar = 124,                  // |
        caret = 94,                 // ^
        closeBrace = 125,           // }
        closeBracket = 93,          // ]
        closeParen = 41,            // )
        colon = 58,                 // : 
        comma = 44,                 // ,
        dot = 46,                   // .
        doubleQuote = 34,           // "
        equals = 61,                // =
        exclamation = 33,           // !
        hash = 35,                  // #
        greaterThan = 62,           // >
        lessThan = 60,              // <
        minus = 45,                 // -
        openBrace = 123,            // {
        openBracket = 91,           // [
        openParen = 40,             // (
        percent = 37,               // %
        plus = 43,                  // +
        question = 63,              // ?
        semicolon = 59,             // ;
        singleQuote = 39,           // '
        slash = 47,                 // /
        tilde = 126,                // ~
        _0 = 48,
        _9 = 57,
        a = 97,
        z = 122,

        A = 65,
        Z = 90,
        space = 0x0020,   // " "
    }
    enum TokenType {
        ADD,
        DIV,
        MUL,
        SUB,
        INT,
        REAL,
        VARIABLE,
        EQ,
        LEQ,
        GEQ,
        IMPLIES,
        CPAREN,
        OPAREN,
        PATTERNVAR,
        ID,
        CMD,
        HAT,
        UNDER,
        COMMA,
        EOI
    }

    interface Token {
        type: TokenType;
        offset?: number;
        text?: string;
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
    }


    function map<T>(a: T[], f: (item: T) => void) {
        for (var i = 0, len = a.length; i < len; i++) {
            f(a[i]);
        }
    }

    module TokenInfo {
        export interface MathItem extends PrefixTree.Item {
            texString?: string;
        }

        export interface MathCmdSym extends MathItem {
            arity: number;
            infix?: boolean;
            sub?: boolean;
            exp?: boolean;
            op?: Operator;
            prec?: TokenPrecedence;
            curlies?: boolean;
        }

        export function getMathCmdInfo(name: string) {
            return mathCmdTree.complete(name);
        }

        export function getMathCmdInfoMatch(key: string) {
            return mathCmdTree.find(key);
        }

        var prefixDiag = false;
        export var mathCmdTree = PrefixTree.createSymtab<MathCmdSym>();
        var greekLetters = [
            "alpha", "beta", "gamma", "delta", "epsilon", "varepsilon",
            "zeta", "eta", "Gamma", "Delta", "Theta", "theta", "vartheta",
            "iota", "kappa", "lambda", "mu", "nu", "xi", "Lambda", "Xi",
            "Pi", "pi", "varpi", "rho", "varrho", "sigma", "varsigma",
            "Sigma", "Upsilon", "Phi", "upsilon", "phi", "varphi", "chi",
            "psi", "omega", "Psi", "Omega"
        ];
        var bigOpsSubExp = [
            "int", "sum", "prod", "coprod", "oint"
        ];
        var bigOpsSub = [
            "bigcup", "bigcap", "bigsqcup", "bigvee", "bigwedge", "lim"
        ];
        // SETMINUS, PLUSMINUS, INTERSECTION, AND, OR, UNION, CONG, SUBSETEQ, VDASH, EQUIV, OWNS
        var binaryOperators = [
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
        var binaryRelations = [
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
        ];

        map(greekLetters, ((letter) => mathCmdTree.add({ key: letter, arity: 0, texString: "\\" + letter })));
        map(bigOpsSubExp, ((name) => mathCmdTree.add({ key: name, arity: 1, sub: true, exp: true, texString: "\\" + name })));
        map(bigOpsSub, ((name) => mathCmdTree.add({ key: name, arity: 1, sub: true, texString: "\\" + name })));
        map(binaryOperators, ((oper) => mathCmdTree.add({ key: oper.key, arity: 2, infix: true, op: oper.op, texString: "\\" + oper.key })));
        map(binaryRelations, ((oper) => mathCmdTree.add({ key: oper.key, arity: 2, infix: true, op: oper.op, texString: "\\" + oper.key })));
        mathCmdTree.add({ key: "cos", arity: 1, exp: true, texString: "\\cos" });
        mathCmdTree.add({ key: "log", arity: 1, exp: true, texString: "\\log" });
        mathCmdTree.add({ key: "ln", arity: 1, exp: true, texString: "\\ln" });
        mathCmdTree.add({ key: "infty", arity: 0, texString: "\\infty" });
        mathCmdTree.add({ key: "partial", arity: 1, exp: true, texString: "\\partial" });
        mathCmdTree.add({ key: "neg", arity: 1, texString: "\\neg" });
        mathCmdTree.add({ key: "overline", arity: 1, texString: "\\overline{}", curlies: true });
        mathCmdTree.add({ key: "circ", arity: 0, texString: "\\circ" });
        mathCmdTree.add({ key: "sin", arity: 1, exp: true, texString: "\\sin" });
        // TODO: [3] for cube root etc.
        mathCmdTree.add({ key: "sqrt", arity: 1, texString: "\\sqrt{}", curlies: true });
        mathCmdTree.add({ key: "to", arity: 0, texString: "\\to" });

        if (prefixDiag) {
            mathCmdTree.print();
            var fnd = mathCmdTree.find("geq");
            if (fnd) {
                console.log(fnd.key);
            }
        }
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

        export interface TokenProperties {
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
        var singleTokText: string[] = [];
        singleTokText[TokenType.SUB] = "-";
        singleTokText[TokenType.DIV] = "";
        singleTokText[TokenType.ADD] = "+";
        singleTokText[TokenType.OPAREN] = "(";
        singleTokText[TokenType.CPAREN] = ")";
        singleTokText[TokenType.COMMA] = ",";

        export function tokenText(tok: Token) {
            if (typeof tok.text !== "undefined") {
                return tok.text;
            }
            else {
                return singleTokText[tok.type];
            }
        }
        export var singleToks: Token[] = [];
        singleToks[CharacterCodes.minus] = { type: TokenType.SUB };
        singleToks[CharacterCodes.plus] = { type: TokenType.ADD };
        singleToks[CharacterCodes.slash] = { type: TokenType.DIV };
        singleToks[CharacterCodes.openParen] = { type: TokenType.OPAREN };
        singleToks[CharacterCodes.closeParen] = { type: TokenType.CPAREN };
        singleToks[CharacterCodes.caret] = { type: TokenType.HAT };
        singleToks[CharacterCodes.comma] = { type: TokenType.COMMA };
        singleToks[CharacterCodes._] = { type: TokenType.UNDER };
        export var eqToken = { type: TokenType.EQ };
        export var impliesToken = { type: TokenType.IMPLIES };
        export var props: TokenProperties[] = [];
        props[TokenType.INT] = { flags: TokenLexFlags.PrimaryFirstSet };
        props[TokenType.REAL] = { flags: TokenLexFlags.PrimaryFirstSet };
        props[TokenType.PATTERNVAR] = { flags: TokenLexFlags.PrimaryFirstSet };
        props[TokenType.VARIABLE] = { flags: TokenLexFlags.PrimaryFirstSet };
        props[TokenType.CMD] = { flags: TokenLexFlags.PrimaryFirstSet };
        props[TokenType.OPAREN] = { flags: TokenLexFlags.PrimaryFirstSet };
        props[TokenType.ID] = { flags: TokenLexFlags.PrimaryFirstSet };
        props[TokenType.ADD] = { flags: TokenLexFlags.Binop, precedence: TokenPrecedence.ADD, op: Operator.ADD };
        props[TokenType.SUB] = { flags: TokenLexFlags.Binop, precedence: TokenPrecedence.ADD, op: Operator.SUB };
        props[TokenType.DIV] = {
            flags: TokenLexFlags.Binop,
            precedence: TokenPrecedence.MUL, op: Operator.DIV
        };
        props[TokenType.MUL] = { flags: TokenLexFlags.Binop, precedence: TokenPrecedence.MUL, op: Operator.MUL };
        props[TokenType.EQ] = { flags: TokenLexFlags.Relop, precedence: TokenPrecedence.REL, op: Operator.EQ };
        props[TokenType.LEQ] = { flags: TokenLexFlags.Relop, precedence: TokenPrecedence.REL, op: Operator.LEQ };
        props[TokenType.GEQ] = { flags: TokenLexFlags.Relop, precedence: TokenPrecedence.REL, op: Operator.GEQ };
        props[TokenType.IMPLIES] = { flags: TokenLexFlags.Binop, precedence: TokenPrecedence.IMPLIES, op: Operator.IMPLIES };
        props[TokenType.HAT] = { flags: TokenLexFlags.Binop, precedence: TokenPrecedence.EXP, op: Operator.EXP, rightAssoc: true };
        props[TokenType.UNDER] = { flags: TokenLexFlags.Binop, precedence: TokenPrecedence.UNDER, op: Operator.UNDER, rightAssoc: true };
    }

    function isDecimalDigit(c: number): boolean {
        return c >= CharacterCodes._0 && c <= CharacterCodes._9;
    }

    function isVariableChar(c: number): boolean {
        return (c >= CharacterCodes.a && c <= CharacterCodes.z) ||
            (c >= CharacterCodes.A && c <= CharacterCodes.Z);
    }

    function isWhitespaceChar(ch: number) {
        return ch == CharacterCodes.space;
    }

    function tokenPrint(tok: Token) {
        console.log(TokenType[tok.type] + (tok.text ? (": " + tok.text) : ""));
    }

    interface CharStream {
        chars: string;
        index: number;
    }

    var eoc = -1;

    function charStreamPeek(charStream: CharStream) {
        return charStreamGet(charStream, false);
    }

    function charStreamAdvance(charStream: CharStream) {
        charStreamGet(charStream, true);
    }

    function charStreamRetreat(charStream: CharStream, amt: number) {
        charStream.index -= amt;

        if (charStream.index < 0) {
            charStream.index = 0;
        }
    }

    function charStreamGet(charStream: CharStream, advance = true) {
        var charsLen = charStream.chars.length;
        if (charStream.index < charsLen) {
            var ch = charStream.chars.charCodeAt(charStream.index);
            if (advance) {
                charStream.index++;
            }
            return ch;
        }
        else {
            return eoc;
        }
    }

    function charStreamGetString(charStream: CharStream, advance = true) {
        var charsLen = charStream.chars.length;
        if (charStream.index < charsLen) {
            var ch = charStream.chars.charAt(charStream.index);
            if (advance) {
                charStream.index++;
            }
            return ch;
        }
        else {
            return "";
        }
    }

    function lexInput(input: string) {
        var tokens: Token[] = [];
        var charStream = { chars: input, index: 0 };
        var tailId = "";
        var prevTok;

        do {
            var tok = lexStep();
            //tokenPrint(tok);
            if (tok.type == TokenType.CMD) {
                tailId = tok.text;
            }
            else if (tok.type != TokenType.EOI) {
                tailId = "";
            }
            tokens.push(tok);
        } while (tok.type != TokenType.EOI);

        return tokStreamCreate(tokens, tailId);

        // TODO: real numbers
        function lexNumber(): Token {
            var startOffset = charStream.index;
            do {
                var ch = charStreamGet(charStream);
            } while (isDecimalDigit(ch));
            if (ch != eoc) {
                charStreamRetreat(charStream, 1);
            }
            var numString = input.substring(startOffset, charStream.index);
            return { type: TokenType.INT, text: numString, offset: startOffset };
        }

        // assumes char stream points at first character in identifier
        function lexId(type: TokenType): Token {
            var startOffset = charStream.index;
            do {
                var ch = charStreamGet(charStream);
            } while (isVariableChar(ch));
            if (ch != eoc) {
                charStreamRetreat(charStream, 1);
            }
            return { type: type, text: input.substring(startOffset, charStream.index), offset: startOffset };
        }

        function lexEq(charStream: CharStream): Token {
            // first character is '='
            charStreamAdvance(charStream);
            var nextChar = charStreamPeek(charStream);
            if (nextChar == CharacterCodes.greaterThan) {
                // recognized an '=>'
                charStreamAdvance(charStream);
                return TokenInfo.impliesToken;
            }
            else {
                // recognized "="
                return TokenInfo.eqToken;
            }
        }

        function lexStep(): Token {
            var ch = charStreamPeek(charStream);
            //console.log(ch);
            while (isWhitespaceChar(ch)) {
                charStreamAdvance(charStream);
                ch = charStreamPeek(charStream);
            }
            if (isDecimalDigit(ch)) {
                return lexNumber();
            }
            else if (isVariableChar(ch)) {
                // variables are single-letter
                return { type: TokenType.VARIABLE, text: charStreamGetString(charStream), offset: charStream.index - 1 };
            }

            var singleTok = TokenInfo.singleToks[ch];
            if (singleTok) {
                charStreamAdvance(charStream);
                return singleTok;
            }
            switch (ch) {
                case CharacterCodes.equals:
                    return lexEq(charStream);
                case eoc:
                    return { type: TokenType.EOI, offset: charStream.index };
                case CharacterCodes.question:
                    charStreamAdvance(charStream);
                    return lexId(TokenType.PATTERNVAR);
                case CharacterCodes.colon:
                    charStreamAdvance(charStream);
                    return lexId(TokenType.ID);
                case CharacterCodes.hash:
                case CharacterCodes.backslash:
                    charStreamAdvance(charStream);
                    return lexId(TokenType.CMD);
            }
            return { type: TokenType.EOI, offset: charStream.index };
        }
    }


    var operatorToPrecedence: TokenInfo.TokenPrecedence[] = [];
    operatorToPrecedence[Operator.IMPLIES] = TokenInfo.TokenPrecedence.IMPLIES;
    operatorToPrecedence[Operator.EQ] = TokenInfo.TokenPrecedence.REL;
    operatorToPrecedence[Operator.LEQ] = TokenInfo.TokenPrecedence.REL;
    operatorToPrecedence[Operator.GEQ] = TokenInfo.TokenPrecedence.REL;
    operatorToPrecedence[Operator.IN] = TokenInfo.TokenPrecedence.IN;
    operatorToPrecedence[Operator.MUL] = TokenInfo.TokenPrecedence.MUL;
    operatorToPrecedence[Operator.DIV] = TokenInfo.TokenPrecedence.MUL;
    operatorToPrecedence[Operator.ADD] = TokenInfo.TokenPrecedence.ADD;
    operatorToPrecedence[Operator.SUB] = TokenInfo.TokenPrecedence.ADD;
    operatorToPrecedence[Operator.UNDER] = TokenInfo.TokenPrecedence.EXP;
    operatorToPrecedence[Operator.EXP] = TokenInfo.TokenPrecedence.EXP;
    operatorToPrecedence[Operator.IN] = TokenInfo.TokenPrecedence.IN;
    operatorToPrecedence[Operator.SETMINUS] = TokenInfo.TokenPrecedence.ADD;
    operatorToPrecedence[Operator.PLUSMINUS] = TokenInfo.TokenPrecedence.ADD;
    operatorToPrecedence[Operator.INTERSECTION] = TokenInfo.TokenPrecedence.MUL;
    operatorToPrecedence[Operator.UNION] = TokenInfo.TokenPrecedence.MUL;
    operatorToPrecedence[Operator.AND] = TokenInfo.TokenPrecedence.LOG;
    operatorToPrecedence[Operator.OR] = TokenInfo.TokenPrecedence.LOG;
    operatorToPrecedence[Operator.CONG] = TokenInfo.TokenPrecedence.REL;
    operatorToPrecedence[Operator.SUBSETEQ] = TokenInfo.TokenPrecedence.IN;
    operatorToPrecedence[Operator.SUBSET] = TokenInfo.TokenPrecedence.IN;
    operatorToPrecedence[Operator.VDASH] = TokenInfo.TokenPrecedence.IMPLIES;
    operatorToPrecedence[Operator.EQUIV] = TokenInfo.TokenPrecedence.REL;
    operatorToPrecedence[Operator.OWNS] = TokenInfo.TokenPrecedence.IN;
    operatorToPrecedence[Operator.NOTIN] = TokenInfo.TokenPrecedence.IN;


    // place constants first and also ordered by complexity
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
        ERROR
    }

    module Constants {
        export function match(c: Constant, e: Expr) {
            if (isConstant(e)) {
                var prom = promote(c, <Constant>e);
                if (prom.c1.type == ExprType.RATIONAL) {
                    var r1 = <Rational>prom.c1;
                    var r2 = <Rational>prom.c2;
                    return (r1.a == r2.a) && (r1.b == r2.b);
                }
                else {
                    return (<Real>prom.c1).value == (<Real>prom.c2).value;
                }
            }
            return false;
        }

        export function makeInt(n: number): Integer {
            return { type: ExprType.INTEGER, value: n };
        }

        export function rationalOp(op: Operator, r1: Rational, r2: Rational) {
            var l = lcd(r1, r2);
            r1 = l.r1;
            r2 = l.r2;
            switch (op) {
                case Operator.ADD:
                    return <Rational>{ type: ExprType.RATIONAL, a: r1.a + r2.a, b: r1.b };
                case Operator.SUB:
                    return <Rational>{ type: ExprType.RATIONAL, a: r1.a - r2.a, b: r1.b };
                case Operator.MUL:
                    return simplifyRational({ type: ExprType.RATIONAL, a: r1.a * r2.a, b: r1.b * r1.b });
                case Operator.DIV:
                    return simplifyRational({ type: ExprType.RATIONAL, a: r1.a * r2.b, b: r1.b * r2.a });
                case Operator.EXP:
                    if (r2.b == 1) {
                        return simplifyRational({ type: ExprType.RATIONAL, a: Math.pow(r1.a, r2.a), b: Math.pow(r1.b, r2.a) });
                    }
                    else if ((r2.a % r2.b) == 0) {
                        var exp = r2.a / r2.b;
                        return simplifyRational({ type: ExprType.RATIONAL, a: Math.pow(r1.a, exp), b: Math.pow(r1.b, exp) });
                    }
                    else {
                        // punt to real
                        return (<Real>{ type: ExprType.REAL, value: Math.pow(r1.a / r1.b, r2.a / r2.b) });
                    }
            }
        }

        export function negate(c: Constant): Constant {
            if (c.type == ExprType.RATIONAL) {
                var r = <Rational>c;
                return <Rational>{ type: ExprType.RATIONAL, a: -r.a, b: r.b };
            }
            else {
                var real = <Real>c;
                return <Real>{ type: c.type, value: -real.value };
            }
        }

        export function isNegative(c: Constant): boolean {
            if (c.type == ExprType.RATIONAL) {
                var r = <Rational>c;
                return ((r.a < 0) && (r.b > 0)) || ((r.a > 0) && (r.b < 0));
            }
            else {
                var real = <Real>c;
                return real.value < 0;
            }
        }

        // TODO: handle negative integers and rationals
        function gcd(a: number, b: number): number {
            if (b == 0) {
                return a;
            }
            else if (a == 0) {
                return b;
            }
            else return gcd(b, a % b);
        }

        function lcm(k1, k2) {
            return (Math.abs(k1 * k2) / gcd(k1, k2));
        }

        export function lcd(r1: Rational, r2: Rational) {
            if (r2.b == r1.b) {
                return { r1: r1, r2: r2 };
            }
            else {
                var d = lcm(r1.b, r2.b);
                var f = d / r1.b;
                var nr1: Rational;
                if (r1.a == 0) {
                    nr1 = { type: ExprType.RATIONAL, a: 0, b: d };
                }
                else {
                    nr1 = { type: ExprType.RATIONAL, a: f * r1.a, b: f * r1.b };
                }
                f = d / r2.b;
                var nr2: Rational;
                if (r2.a == 0) {
                    nr2 = { type: ExprType.RATIONAL, a: 0, b: d };
                }
                else {
                    nr2 = { type: ExprType.RATIONAL, a: f * r2.a, b: f * r2.b };
                }
                return { r1: nr1, r2: nr2 };
            }
        }

        export function simplifyRational(rat: Rational): Expr {
            if ((rat.a % rat.b) == 0) {
                return <Integer>{ type: ExprType.INTEGER, value: rat.a / rat.b };
            }
            var d = gcd(rat.a, rat.b);
            if (d == 1) {
                return rat;
            }
            else return <Rational>{ type: ExprType.RATIONAL, a: rat.a / d, b: rat.b / d };
        }

        export function convertConstant(c: Constant, type: ExprType) {
            if (c.type < type) {
                if (c.type == ExprType.INTEGER) {
                    if (type == ExprType.REAL) {
                        return <Real>{ type: ExprType.REAL, value: (<Integer>c).value };
                    }
                    else {
                        // type == ExprType.RATIONAL
                        return <Rational>{ type: ExprType.RATIONAL, a: (<Integer>c).value, b: 1 };
                    }
                }
                else if (c.type == ExprType.RATIONAL) {
                    // type == ExprType.REAL
                    var rat = <Rational>c;
                    return <Real>{ type: ExprType.REAL, value: rat.a / rat.b };
                }
            }
            else {
                return c;
            }
        }

        export function promote(a: Constant, b: Constant) {
            if (a.type == b.type) {
                return { c1: a, c2: b };
            }
            else if (a.type < b.type) {
                return { c1: convertConstant(a, b.type), c2: b };
            }
            else {
                return { c1: a, c2: convertConstant(b, a.type) };
            }
        }
    }

    export interface Expr {
        type: ExprType;
        pendingParens?: string;
        parenthesized?: boolean;
        minChar?: number;
        limChar?: number;
    }

    export interface Tuple extends Expr {
        elements: Expr[];
    }

    interface Unop extends Expr {
        op: Operator;
        operand1: Expr;
    }

    interface Binop extends Unop {
        operand2: Expr;
    }

    export interface Constant extends Expr {
        assignedVar?: Variable;
    }

    interface Real extends Constant {
        value: number;
    }

    interface Integer extends Real {
    }

    interface Rational extends Constant {
        a: number;
        b: number;
    }

    interface Call extends Expr {
        name: string;
        notFound?: boolean;
        sub?: Expr;
        exp?: Expr;
        prefixCmds?: TokenInfo.MathCmdSym[];
        params: Expr[];
        curlies?: boolean;
    }

    export interface Variable extends Expr {
        text: string;
        // subscript expression, if any
        sub?: Expr;
    }

    enum PatternVarType {
        Const,
        Var,
        Expr,
        Any
    }

    // text can be more than one character
    // used in patterns that match expressions
    interface PatternVar extends Variable {
        pvarType: PatternVarType;
    }

    interface EquationRow {
        input: string;
        eqn: Expr;
        div?: HTMLDivElement;
    }

    interface TokenStream {
        tokens: Token[];
        index: number;
        tailId?: string;
    }

    function tokStreamPeek(tokStream: TokenStream) {
        return tokStreamGet(tokStream, false);
    }

    function tokStreamAtEOI(tokStream: TokenStream) {
        return (tokStream.tokens.length == tokStream.index);
    }

    function tokStreamAdvance(tokStream: TokenStream) {
        tokStreamGet(tokStream, true);
    }

    function tokStreamGet(tokStream: TokenStream, advance = true) {
        var tokensLen = tokStream.tokens.length;
        if (tokStream.index < tokensLen) {
            var tok = tokStream.tokens[tokStream.index];
            if (advance) {
                tokStream.index++;
            }
            return tok;
        }
        else {
            return { type: TokenType.EOI, offset: -1 };
        }
    }

    function tokStreamCreate(tokens: Token[], tailId?: string) {
        return { tokens: tokens, index: 0, tailId: tailId };
    }

    function makeErrorExpr(parsedSoFar: number): Expr {
        return { type: ExprType.ERROR, minChar: parsedSoFar };
    }

    function getPvarType(tokStream: TokenStream): PatternVarType {
        var tok = tokStreamPeek(tokStream);
        if (tok.type == TokenType.ID) {
            tokStreamAdvance(tokStream);
            if (tok.text == "const") {
                return PatternVarType.Const;
            }
            else if (tok.text == "var") {
                return PatternVarType.Var;
            }
            else if (tok.text == "expr") {
                return PatternVarType.Expr;
            }

        }
        return PatternVarType.Any;
    }

    function parseCall(tokStream: TokenStream, name: string): Call {
        var sub: Expr;
        var exp: Expr;
        var tok = tokStreamPeek(tokStream);
        var cmdInfo = TokenInfo.getMathCmdInfo(name);
        var callExpr: Call = {
            type: ExprType.CALL,
            name: name,
            params: [],
        };
        if (cmdInfo.length === 0) {
            callExpr.notFound = true;
        }
        else if ((cmdInfo.length === 1) && (cmdInfo[0].key === name)) {
            // matched single command
            if (cmdInfo[0].arity == 1) {
                if (tok.type == TokenType.UNDER) {
                    tokStreamAdvance(tokStream);
                    sub = parseExpr(tokStream, TokenInfo.TokenPrecedence.UNDER);
                    tok = tokStreamPeek(tokStream);
                }
                if (tok.type == TokenType.HAT) {
                    tokStreamAdvance(tokStream);
                    exp = parseExpr(tokStream, TokenInfo.TokenPrecedence.EXP);
                }
                var param = parseExpr(tokStream, TokenInfo.TokenPrecedence.MUL);
                callExpr.sub = sub;
                callExpr.exp = exp;
                callExpr.params = [param];
                callExpr.curlies = cmdInfo[0].curlies;
            }
        }
        else {
            callExpr.prefixCmds = cmdInfo;
        }
        return callExpr;
    }

    function parseTupleTail(expr: Expr, tokStream: TokenStream): Expr {
        var elements = [expr];
        var tok: Token;

        do {
            elements.push(parseExpr(tokStream));
            tok = tokStreamGet(tokStream);
        }
        while (tok.type == TokenType.COMMA);

        if ((tok.type != TokenType.CPAREN) && (tok.type != TokenType.EOI)) {
            return makeErrorExpr(tok.offset);
        }
        else {
            var tuple: Expr = <Tuple>{ type: ExprType.TUPLE, elements: elements };
            if (tok.type == TokenType.EOI) {
                tuple.pendingParens = "(";
            }
            return tuple;
        }
    }

    function parsePrimary(tokStream: TokenStream): Expr {
        var tok = tokStreamGet(tokStream);
        var expr: Expr;

        switch (tok.type) {
            case TokenType.OPAREN:
                expr = parseExpr(tokStream);
                tok = tokStreamGet(tokStream);
                if (tok.type != TokenType.CPAREN) {
                    if (tok.type == TokenType.COMMA) {
                        return parseTupleTail(expr, tokStream);
                    }
                    else if (tok.type == TokenType.EOI) {
                        if (expr.pendingParens) {
                            expr.pendingParens += "(";
                        }
                        else {
                            expr.pendingParens = "(";
                        }
                        expr.minChar = tok.offset;
                        return expr;
                    }
                    else return makeErrorExpr(tok.offset);
                }
                else {
                    expr.parenthesized = true;
                    return (expr);
                }
            case TokenType.CMD:
                return parseCall(tokStream, tok.text);
            case TokenType.INT:
                return <Integer>{ type: ExprType.INTEGER, value: parseInt(tok.text), inputOffset: tok.offset };
            case TokenType.REAL:
                return <Real>{ type: ExprType.REAL, value: parseFloat(tok.text), inputOffset: tok.offset };
            case TokenType.VARIABLE:
                return <Variable>{ type: ExprType.VARIABLE, text: tok.text, inputOffset: tok.offset };
            case TokenType.PATTERNVAR: {
                var pvarType = getPvarType(tokStream);
                return <PatternVar>{ type: ExprType.PATTERNVAR, text: tok.text, pvarType: pvarType, inputOffset: tok.offset };
            }
            default:
                return makeErrorExpr(tok.offset);
        }
    }

    function parseExpr(tokStream: TokenStream, prevPrecedence = TokenInfo.TokenPrecedence.NONE): Expr {
        var tok = tokStreamPeek(tokStream);
        var usub = false;
        if (tok.type == TokenType.SUB) {
            // unary minus
            tokStreamAdvance(tokStream);
            usub = true;
        }
        var left = parsePrimary(tokStream);
        if (usub) {
            if (isConstant(left)) {
                left = Constants.negate(<Constant>left);
            }
            else {
                left = <Unop>{ type: ExprType.UNOP, op: Operator.SUB, operand1: left };
            }
        }
        tok = tokStreamPeek(tokStream);
        while ((tok.type != TokenType.EOI) && (tok.type != TokenType.CPAREN) && (tok.type != TokenType.COMMA)) {
            var props = TokenInfo.props[tok.type];
            var rightAssoc = false;
            var precedence: TokenInfo.TokenPrecedence;
            var realOpToken = true;
            var op: Operator;

            if (tok.type == TokenType.CMD) {
                var cmdInfo = TokenInfo.getMathCmdInfoMatch(tok.text);
                if (cmdInfo && cmdInfo.infix) {
                    op = cmdInfo.op;
                    precedence = operatorToPrecedence[op];
                }
                else {
                    // treat as impending multiply
                    precedence = TokenInfo.TokenPrecedence.MUL;
                    realOpToken = false;
                    op = Operator.MUL;
                }
            }
            else if (props.flags & TokenInfo.TokenLexFlags.Binop) {
                precedence = props.precedence;
                op = props.op;
                rightAssoc = props.rightAssoc;
            }
            else if (props.flags & TokenInfo.TokenLexFlags.PrimaryFirstSet) {
                precedence = TokenInfo.TokenPrecedence.MUL;
                realOpToken = false;
                op = Operator.MUL;
            }
            if ((prevPrecedence < precedence) || ((prevPrecedence == precedence) && rightAssoc)) {
                // previous op has weaker precedence
                if (realOpToken) {
                    tokStreamAdvance(tokStream);
                }
                var right = parseExpr(tokStream, precedence);
                if ((op == Operator.UNDER) && (left.type == ExprType.VARIABLE)) {
                    var vleft = <Variable>left;
                    vleft.sub = right;
                }
                else {
                    left = <Binop>{ type: ExprType.BINOP, op: op, operand1: left, operand2: right };
                }
            }
            else {
                return left;
            }
            tok = tokStreamPeek(tokStream);
        }
        return left;
    }

    function parse(s: string): Expr {
        return parseExpr(lexInput(s));
    }

    function parseEqn(tokStream): Expr {
        var left = parseExpr(tokStream, TokenInfo.TokenPrecedence.REL);
        var tok = tokStreamGet(tokStream);
        // TODO: add other rel ops
        if (tok.type != TokenType.EQ) {
            return makeErrorExpr(tok.offset);
        }
        else {
            var right = parseExpr(tokStream, TokenInfo.TokenPrecedence.IMPLIES);
            return <Binop>{ type: ExprType.BINOP, op: Operator.EQ, operand1: left, operand2: right };
        }

    }

    var texString: string[] = [];
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
    var inputString: string[] = [];
    inputString[Operator.ADD] = "+";
    inputString[Operator.SUB] = "-";
    inputString[Operator.DIV] = "/";
    inputString[Operator.EQ] = "=";
    inputString[Operator.LEQ] = "<=";
    inputString[Operator.UNDER] = "_";
    inputString[Operator.EXP] = "^";
    inputString[Operator.IMPLIES] = "=>";
    inputString[Operator.MUL] = "";
    inputString[Operator.AND] = "\\wedge ";

    function isInfix(op: Operator) {
        return (op != Operator.DIV);
    }

    function isParamOp(op: Operator) {
        return (op == Operator.EXP) || (op == Operator.UNDER);
    }

    function exprToString(expr: Expr, prevPrecedence = TokenInfo.TokenPrecedence.NONE, left = false) {
        var text = "";
        var op1Text: string;
        var op2Text: string;
        switch (expr.type) {
            case ExprType.TUPLE: {
                var tuple = <Tuple>expr;
                text += "(";
                for (var i = 0, len = tuple.elements.length; i < len; i++) {
                    if (i > 0) {
                        text += ",";
                    }
                    text += exprToString(tuple.elements[i], precedence, false);
                }
                text += ")";
                break;
            }
            case ExprType.BINOP:
                var binex = <Binop>expr;
                var precedence = operatorToPrecedence[binex.op];
                if (isInfix(binex.op)) {
                    op1Text = exprToString(binex.operand1, precedence, true);
                    var rightPrec = precedence;
                    op2Text = exprToString(binex.operand2, rightPrec, false);
                    var parenthesize = false;
                    if (left) {
                        parenthesize = (precedence < prevPrecedence);
                    }
                    else {
                        parenthesize = (precedence <= prevPrecedence);
                    }
                    if (parenthesize) {
                        text += "(";
                    }
                    text += op1Text;
                    text += inputString[binex.op];
                    text += op2Text;
                    if (parenthesize) {
                        text += ")";
                    }
                }
                break;
            case ExprType.UNOP:
                var unex = <Unop>expr;
                text += "-" + exprToString(unex.operand1, TokenInfo.TokenPrecedence.NEG, false);
                break;
            // TODO: ExprType.RATIONAL
            case ExprType.RATIONAL: {
                var rat = <Rational>expr;
                if (Constants.isNegative(rat)) {
                    text += "-";
                }
                text += Math.abs(rat.a).toString() + "/" + Math.abs(rat.b).toString();
                break;
            }
            case ExprType.CALL: {
                var ecall = <Call>expr;
                if ((!ecall.notFound) && (!ecall.prefixCmds)) {
                    text += "\\" + ecall.name;
                    if (ecall.sub) {
                        text += "_(" + exprToString(ecall.sub) + ")";
                    }
                    if (ecall.exp) {
                        text += "^(" + exprToString(ecall.exp) + ")";
                    }
                    text += " ";
                    if (ecall.params.length === 1) {
                        text += exprToString(ecall.params[0]);
                    }
                }
                break;
            }
            case ExprType.INTEGER:
            case ExprType.REAL: {
                var c = <Constant>expr;
                if (c.assignedVar) {
                    text += exprToString(c.assignedVar, prevPrecedence, left);
                }
                else {
                    text += (<Real>expr).value;
                }
                break;
            }
            case ExprType.VARIABLE: {
                var vexpr = <Variable>expr;
                text += vexpr.text;
                if (vexpr.sub) {
                    text += "_(" + exprToString(vexpr.sub, TokenInfo.TokenPrecedence.NONE, false) + ")";
                }
                break;
            }
            case ExprType.PATTERNVAR:
                var pvar = <PatternVar>expr;
                text += "?" + pvar.text + ((pvar.pvarType == PatternVarType.Any) ? "" : (":" + PatternVarType[pvar.pvarType]));
                break;
        }
        return text;
    }

    function exprToTexParens(expr: Expr) {
        return exprToTex(expr, true, TokenInfo.TokenPrecedence.NONE, false, true);
    }

    function exprToTex(expr: Expr, inputMode = true, prevPrecedence = TokenInfo.TokenPrecedence.NONE, left = false, alwaysParens = false): string {
        var tex = expr.pendingParens ? expr.pendingParens : "";
        var showParens = alwaysParens || (inputMode && (expr.parenthesized));
        var op1Tex: string;
        var op2Tex: string;
        switch (expr.type) {
            case ExprType.TUPLE: {
                var tuple = <Tuple>expr;
                if (!expr.pendingParens) {
                    tex += "(";
                }
                for (var i = 0, len = tuple.elements.length; i < len; i++) {
                    if (i > 0) {
                        tex += ",";
                    }
                    tex += exprToTex(tuple.elements[i], inputMode, precedence, false, alwaysParens);
                }
                if (!expr.pendingParens) {
                    tex += ")";
                }
                break;
            }
            case ExprType.BINOP:
                var binex = <Binop>expr;
                var precedence = operatorToPrecedence[binex.op];
                if (isInfix(binex.op)) {
                    var paramOp = isParamOp(binex.op);
                    op1Tex = exprToTex(binex.operand1, inputMode, precedence, true, alwaysParens);
                    var rightPrec = precedence;
                    if (paramOp) {
                        rightPrec = TokenInfo.TokenPrecedence.NONE;
                    }
                    op2Tex = exprToTex(binex.operand2, inputMode, rightPrec, false, alwaysParens);
                    var parenthesize = showParens;
                    if (!parenthesize) {
                        if (left) {
                            parenthesize = (precedence < prevPrecedence) && (!expr.pendingParens);
                        }
                        else {
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
                }
                else {
                    var paramPrec = inputMode ? precedence : TokenInfo.TokenPrecedence.NONE;
                    op1Tex = exprToTex(binex.operand1, inputMode, paramPrec, false, alwaysParens);
                    op2Tex = exprToTex(binex.operand2, inputMode, paramPrec, false, alwaysParens);
                    tex += texString[binex.op];
                    tex += "{" + op1Tex + "}";
                    tex += "{" + op2Tex + "}";
                }
                break;
            case ExprType.UNOP:
                var unex = <Unop>expr;
                tex += "-" + exprToTex(unex.operand1, inputMode, TokenInfo.TokenPrecedence.NEG, false, alwaysParens);
                break;
            // TODO: ExprType.RATIONAL
            case ExprType.RATIONAL: {
                var rat = <Rational>expr;
                if (Constants.isNegative(rat)) {
                    tex += "-";
                }
                tex += "\\frac{" + Math.abs(rat.a).toString() + "}{" + Math.abs(rat.b).toString() + "}";
                break;
            }
            case ExprType.CALL: {
                var ecall = <Call>expr;
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
                }
                else if (ecall.notFound) {
                    tex += "\\class{err}{\\mathrm{\\backslash " + ecall.name + "}}";
                }
                else {
                    tex += "\\mathrm{\\backslash " + ecall.name + "}";
                }
                break;
            }
            case ExprType.INTEGER:
            case ExprType.REAL: {
                var c = <Constant>expr;
                if (c.assignedVar) {
                    tex += exprToTex(c.assignedVar, inputMode, prevPrecedence, left, alwaysParens);
                }
                else {
                    tex += (<Real>expr).value;
                }
                break;
            }
            case ExprType.VARIABLE: {
                var vexpr = <Variable>expr;
                tex += vexpr.text;
                if (vexpr.sub) {
                    tex += "_{" + exprToTex(vexpr.sub, inputMode, TokenInfo.TokenPrecedence.NONE, false, alwaysParens) + "}";
                }
                break;
            }
            case ExprType.PATTERNVAR:
                var pvar = <PatternVar>expr;
                if (pvar.text == "cur") {
                    tex += "\\cssId{mcur}{\\cdots}";
                }
                else {
                    tex += "?" + pvar.text + ((pvar.pvarType == PatternVarType.Any) ? "" : (":" + PatternVarType[pvar.pvarType]));
                }
                break;
        }
        return tex;
    }

    interface EquationStack {
        div?: HTMLDivElement;
        rows: EquationRow;
    }

    function testEqn(s: string, norm = false, vsolve?: Variable) {
        console.log("trying " + s + " ...");
        var tokStream = lexInput(s);
        var e = parseEqn(tokStream);
        console.log("which is " + exprToTexParens(e));
        if (norm) {
            e = normalize(e);
            if (vsolve) {
                e = solve(e, vsolve);
            }
        }
        if (e) {
            var tex = exprToTex(e, false);
            console.log(tex);
        }
        else {
            if (vsolve) {
                console.log("no solution for " + vsolve.text);
            }
        }
    }

    function testExpr(s: string) {
        console.log("trying " + s + " ...");
        var tokStream = lexInput(s);
        var e = parseExpr(tokStream);
        var tex = exprToTex(e);
        console.log(tex);
    }


    // for now, object will be fast enough
    interface Environment {
        [s: string]: Expr;
    }

    function bind(env: Environment, pvarName: string, type: PatternVarType, e: Expr): boolean {
        if ((type == PatternVarType.Const) && (!isConstant(e))) {
            return false;
        }
        else if ((type == PatternVarType.Var) && (e.type != ExprType.VARIABLE)) {
            return false;
        }
        else if ((type == PatternVarType.Expr) && (isConstant(e))) {
            return false;
        }
        var existing;
        if (env) {
            existing = env[pvarName];
        }
        if (existing) {
            return match(existing, e, env, true);
        }
        else {
            env[pvarName] = e;
            return true;
        }
    }

    function matchS(p: string, expr: Expr, env?: Environment): boolean {
        var pattern = parse(p);
        return match(pattern, expr, env);
    }
    var diagMatch = false;
    function match(pattern: Expr, expr: Expr, env?: Environment, literal = false): boolean {
        if (diagMatch) {
            var texP = exprToTex(pattern);
            var texE = exprToTexParens(expr);
            console.log("matching " + texP + " vs " + texE);
        }
        var matched = false;
        if (isConstant(pattern)) {
            matched = Constants.match(pattern, expr);
            if ((!matched) && diagMatch) {
                console.log("constant match failed");
            }
            return matched;
        }
        switch (pattern.type) {
            case ExprType.PATTERNVAR: {
                var pvar = <PatternVar>pattern;
                matched = bind(env, pvar.text, pvar.pvarType, expr);
                if ((!matched) && diagMatch) {
                    console.log("bind failed");
                }
                return matched;
            }
            case ExprType.VARIABLE: {
                if (literal) {
                    if (expr.type != ExprType.VARIABLE) {
                        if (diagMatch) {
                            console.log("literal variable match failed with expr type " + ExprType[expr.type]);
                        }
                        return false;
                    }
                    else {
                        var vpat = <Variable>pattern;
                        var vexpr = <Variable>expr;
                        matched = (vpat.text == vexpr.text);
                        if ((!matched) && diagMatch) {
                            console.log("literal variable match failed (2)");
                        }
                        if (matched && vpat.sub) {
                            if (vexpr.sub) {
                                // only literal match of subscript expressions for now
                                matched = match(vpat.sub, vexpr.sub, env, true);
                            }
                            else {
                                matched = false;
                            }
                        }
                        return matched;
                    }
                }
                else {
                    matched = bind(env, (<Variable>pattern).text, PatternVarType.Any, expr);
                    if ((!matched) && diagMatch) {
                        console.log("bind failed");
                    }
                    return matched;
                }
            }
            case ExprType.UNOP: {
                var punex = <Unop>pattern;
                if (expr.type == ExprType.UNOP) {
                    var eunex = <Unop>expr;
                    if (punex.op != eunex.op) {
                        if (diagMatch) {
                            console.log("unop match failed");
                        }
                        return false;
                    }
                    else {
                        return match(punex.operand1, eunex.operand1, env, literal);
                    }
                }
                else if (isConstant(expr)) {
                    if (Constants.isNegative(expr)) {
                        var n = Constants.negate(expr);
                        return match(punex.operand1, n, env, literal);
                    }
                }
                break;
            }
            case ExprType.BINOP: {
                if (expr.type == ExprType.BINOP) {
                    var pbinex = <Binop>pattern;
                    var ebinex = <Binop>expr;
                    if (pbinex.op != ebinex.op) {
                        if (diagMatch) {
                            console.log("binop match failed");
                        }
                        return false;
                    }
                    else {
                        return match(pbinex.operand1, ebinex.operand1, env) &&
                            match(pbinex.operand2, ebinex.operand2, env);
                    }
                }
                break;
            }
        }
        if (diagMatch) {
            console.log("type mismatch " + ExprType[pattern.type] + " vs " + ExprType[expr.type]);
        }
        return false;
    }

    function isConstant(expr: Expr) {
        return (expr.type == ExprType.INTEGER) || (expr.type == ExprType.RATIONAL) || (expr.type == ExprType.REAL);
    }

    function applyBinop(binex: Binop): Expr {
        var promoted = Constants.promote(binex.operand1, binex.operand2);
        var c1 = promoted.c1;
        var c2 = promoted.c2;

        if ((c1.type == ExprType.INTEGER) || (c1.type == ExprType.REAL)) {
            var rc1 = (<Real>c1).value;
            var rc2 = (<Real>c2).value;

            switch (binex.op) {
                case Operator.ADD:
                    return <Expr>{ type: c1.type, value: rc1 + rc2 };
                case Operator.SUB:
                    return <Expr>{ type: c1.type, value: rc1 - rc2 };
                case Operator.MUL:
                    return <Expr>{ type: c1.type, value: rc1 * rc2 };
                case Operator.DIV:
                    if (c1.type == ExprType.INTEGER) {
                        return Constants.simplifyRational({ type: ExprType.RATIONAL, a: rc1, b: rc2 });
                    }
                    else {
                        return <Expr>{ type: c1.type, value: rc1 / rc2 };
                    }
                case Operator.EXP:
                    return <Expr>{ type: c1.type, value: Math.pow(rc1, rc2) };
                default:
                    return (binex);
            }
        }
        else {
            // rational
            return Constants.rationalOp(binex.op, <Rational>c1, <Rational>c2);
        }
    }

    function isFraction(e: Expr) {
        return (e.type == ExprType.BINOP) && ((<Binop>e).op == Operator.DIV);
    }

    function isProduct(e: Expr) {
        return (e.type == ExprType.BINOP) && ((<Binop>e).op == Operator.MUL);
    }


    // assume left and right sides linear in v
    // eliminate fractions then simplify both sides
    function normalize(eqn: Expr) {
        var result = buildIfMatch([
            { pattern: "a/b=c/d", template: "ad=bc" },
            { pattern: "a/b=c", template: "a=bc" },
            { pattern: "a=c/d", template: "ad=c" }], eqn);
        if (result) {
            eqn = result;
        }
        return simplifyExpr(eqn);
    }

    // asume binex is a product
    function mulExprNoVar(env: Environment, factor = 1): boolean {
        var origExpr: Expr = env["f"];
        var expr = origExpr;
        var v = <Variable>env["v"];
        while (expr.type == ExprType.BINOP) {
            var binex = <Binop>expr;
            if (match(v, binex.operand2, env, true)) {
                return false;
            }
            expr = binex.operand1;
        }
        if (!match(v, expr, env, true)) {
            if (factor != 1) {
                env["nf"] = <Binop>{ type: ExprType.BINOP, op: Operator.MUL, operand1: Constants.makeInt(-1), operand2: origExpr };
            }
            else {
                env["nf"] = origExpr;
            }
            return true;
        }
        return false;
    }

    function negateExprIfNoVar(env: Environment) {
        mulExprNoVar(env, -1);
    }

    function walk(expr: Expr, pre: (e: Expr) => boolean, post?: (e: Expr) => void) {
        if ((!pre) || pre(expr)) {
            switch (expr.type) {
                case ExprType.TUPLE: {
                    var tuple = <Tuple>expr;
                    for (var i = 0, len = tuple.elements.length; i < len; i++) {
                        walk(tuple.elements[i], pre, post);
                    }
                    break;
                }
                case ExprType.BINOP: {
                    walk((<Binop>expr).operand1, pre, post);
                    walk((<Binop>expr).operand2, pre, post);
                    break;
                }
                case ExprType.UNOP: {
                    walk((<Unop>expr).operand1, pre, post);
                    break;
                }
                case ExprType.CALL: {
                    var callExpr = <Call>expr;
                    if (callExpr.params) {
                        for (var j = 0, clen = callExpr.params.length; j < clen; j++) {
                            walk(callExpr.params[j], pre, post);
                        }
                    }
                }
            }
            if (post) {
                post(expr);
            }
        }
    }

    function extractTermAndDegree(term: Binop, negate: boolean, v: Variable) {
        if (diagAC) {
            var tex = exprToTexParens(term);
            console.log("extract term with negate " + negate + ": " + tex);
        }
        var constPart: Expr;
        var symbolPart: Expr;
        var degree = 0;
        if (negate) {
            constPart = Constants.makeInt(-1);
        }
        walk(term, (e) => {
            if (isConstant(e)) {
                if (constPart) {
                    constPart = applyBinop({ type: ExprType.BINOP, op: Operator.MUL, operand1: constPart, operand2: e });
                }
                else {
                    constPart = e;
                }
            }
            else if (e.type == ExprType.VARIABLE) {
                if ((<Variable>e).text == v.text) {
                    degree++;
                }
                else {
                    if (symbolPart) {
                        symbolPart = simplifyExpr(<Binop>{ type: ExprType.BINOP, op: Operator.MUL, operand1: symbolPart, operand2: e });
                    }
                    else {
                        symbolPart = e;
                    }
                }
            }
            else if ((e.type == ExprType.BINOP) && ((<Binop>e).op == Operator.EXP)) {
                var binex = <Binop>e;
                if (binex.operand1.type == ExprType.VARIABLE) {
                    if ((<Variable>binex.operand1).text == v.text) {
                        degree += (<Integer>binex.operand2).value;
                    }
                    else {
                        if (symbolPart) {
                            symbolPart = simplifyExpr(<Binop>{ type: ExprType.BINOP, op: Operator.MUL, operand1: symbolPart, operand2: e });
                        }
                        else {
                            symbolPart = e;
                        }
                    }
                }
                else {
                    console.log("need a variable as lhs of exponent");
                }
                return false;
            }
            return true;
        });
        var outTerm: SplitTerm = {};
        if (symbolPart) {
            if (constPart) {
                outTerm.symbolPart = <Binop>{
                    type: ExprType.BINOP, op: Operator.MUL, operand1: constPart, operand2: symbolPart,
                }
            }
            else {
                outTerm.symbolPart = symbolPart;
            }
        }
        else {
            outTerm.constPart = constPart;
        }

        return {
            splitTerm: outTerm,
            degree: degree,
        }
    }

    interface SplitTerm {
        constPart?: Expr;
        symbolPart?: Expr;
    }

    function extractVarCoeff(expr: Expr, v: Variable, negate: boolean, degree: number) {
        var outDegree = 0;
        var term: SplitTerm = {};
        if ((<Variable>expr).text == v.text) {
            outDegree = degree;
            if (negate) {
                term.constPart = Constants.makeInt(-1);
            }
            else {
                term.constPart = Constants.makeInt(1);
            }
        }
        else {
            if (negate) {
                term.symbolPart = <Unop>{ type: ExprType.UNOP, op: Operator.SUB, operand1: expr };
            }
            else {
                term.symbolPart = expr;
            }
        }
        return {
            degree: outDegree,
            splitTerm: term,
        };
    }

    var diagAC = false;
    // convert expression to polynomial coefficient array
    // assume sum of products or e1=e2 where e1 and e2 are sum of products 
    function accumCoefficients(expr: Expr, v: Variable, poly: SplitTerm[], negate: boolean) {
        var term: SplitTerm = {};
        var degree = 0;

        if (diagAC) {
            var tex = exprToTexParens(expr);
            console.log("accum coeffs with negate " + negate + ": " + tex);
        }

        if (isConstant(expr)) {
            term.constPart = expr;
            if (negate) {
                term.constPart = Constants.negate(<Constant>term.constPart);
            }
        }
        else {
            switch (expr.type) {
                case ExprType.UNOP: {
                    var unex = <Unop>expr;
                    negate = !negate;
                    return accumCoefficients(unex.operand1, v, poly, negate);
                }
                case ExprType.VARIABLE: {
                    // bare v term
                    var td = extractVarCoeff(expr, v, negate, 1);
                    degree = td.degree;
                    term = td.splitTerm;
                    break;
                }
                case ExprType.BINOP: {
                    var binex = <Binop>expr;
                    switch (binex.op) {
                        // expect ADD, SUB, MUL, EQ
                        case Operator.ADD:
                        case Operator.SUB: {
                            accumCoefficients(binex.operand1, v, poly, negate);
                            return accumCoefficients(binex.operand2, v, poly, binex.op == Operator.SUB ? !negate : negate);
                        }
                        case Operator.EQ: {
                            accumCoefficients(binex.operand1, v, poly, false);
                            return accumCoefficients(binex.operand2, v, poly, true);
                        }
                        case Operator.MUL: {
                            td = extractTermAndDegree(binex, negate, v);
                            degree = td.degree;
                            term = td.splitTerm;
                            break;
                        }
                        case Operator.EXP: {
                            if (binex.operand1.type == ExprType.VARIABLE) {
                                if (binex.operand2.type == ExprType.INTEGER) {
                                    td = extractVarCoeff(binex.operand1, v, negate, (<Integer>binex.operand2).value);
                                    degree = td.degree;
                                    term = td.splitTerm;
                                }
                                else {
                                    console.log("error: non-integer exponent in accum coeffs");
                                }
                            }
                            else {
                                console.log("error: complex lhs of exponent in accum coeffs");
                            }
                            break;
                        }
                        default:
                            console.log("unexpected operator " + Operator[binex.op]);
                            break;
                    }
                    break;
                }
                default:
                    console.log("unexpected expr type " + ExprType[expr.type]);
                    break;
            }
        }
        if (poly[degree]) {
            if (term.symbolPart) {
                if (poly[degree].symbolPart) {
                    poly[degree].symbolPart = simplifyExpr(<Binop>{ type: ExprType.BINOP, op: Operator.ADD, operand1: poly[degree].symbolPart, operand2: term.symbolPart });
                }
                else {
                    poly[degree].symbolPart = term.symbolPart;
                }
            }
            if (term.constPart) {
                if (poly[degree].constPart) {
                    poly[degree].constPart = applyBinop({ type: ExprType.BINOP, op: Operator.ADD, operand1: poly[degree].constPart, operand2: term.constPart });
                }
                else {
                    poly[degree].constPart = term.constPart;
                }
            }
        }
        else {
            poly[degree] = term;
        }

        return poly;
    }

    function extractCoefficients(expr: Expr, v: Variable) {
        var polySplit: SplitTerm[] = [];
        var poly: Expr[] = [];
        accumCoefficients(expr, v, polySplit, false);
        for (var i = 0, len = polySplit.length; i < len; i++) {
            var splitTerm = polySplit[i];
            if (splitTerm) {
                if (splitTerm.symbolPart) {
                    poly[i] = splitTerm.symbolPart;
                    if (splitTerm.constPart) {
                        poly[i] = <Binop>{ type: ExprType.BINOP, op: Operator.ADD, operand1: poly[i], operand2: splitTerm.constPart };
                    }
                }
                else {
                    poly[i] = splitTerm.constPart;
                }
            }
            else {
                poly[i] = Constants.makeInt(0);
            }
        }
        return poly;
    }

    function solve(eqn: Expr, v: Variable): Expr {
        var norm = normalize(eqn);
        if (!isSumOfProducts(norm)) {
            return undefined;
        }
        var poly = extractCoefficients(norm, v);
        if (poly[0]) {
            if (poly[1]) {
                if (Constants.match(Constants.makeInt(0), poly[1])) {
                    return undefined;
                }
                else {
                    return <Binop>{
                        type: ExprType.BINOP, op: Operator.EQ, operand1: v, operand2:
                        simplifyExpr(<Binop>{
                            type: ExprType.BINOP, op: Operator.DIV, operand1: <Binop>{
                                type: ExprType.BINOP, op: Operator.MUL, operand1: Constants.makeInt(-1), operand2: poly[0]
                            }, operand2: poly[1]
                        }),
                    };
                }
            }
        }
        else {
            return <Binop>{ type: ExprType.BINOP, op: Operator.EQ, operand1: v, operand2: Constants.makeInt(0) };
        }
    }

    function isInt(e: Expr, val?: number) {
        return (e.type == ExprType.INTEGER) && ((typeof val === "undefined") || ((<Integer>e).value == val));
    }

    function subst(e: Expr, env: Environment) {
        var evar: Expr;
        switch (e.type) {
            case ExprType.VARIABLE:
            case ExprType.PATTERNVAR: {
                evar = env[(<Variable>e).text];
                if (evar) {
                    return evar;
                }
                break;
            }
            case ExprType.UNOP: {
                var unex = <Unop>e;
                return <Unop>{ type: ExprType.UNOP, op: unex.op, operand1: subst(unex.operand1, env) };
            }
            case ExprType.BINOP: {
                var binex = <Binop>e;
                return <Binop>{
                    type: ExprType.BINOP, op: binex.op, operand1: subst(binex.operand1, env),
                    operand2: subst(binex.operand2, env)
                };
            }
        }
        return e;
    }

    function buildExpr(s: string, env: Environment) {
        var template = parse(s);
        return subst(template, env);
    }

    interface TransformString {
        pattern: string;
        template: string;
        exec?<T>(env: Environment, arg?: T): boolean;
        param?: any;
    }

    interface MatchInfo {
        index?: number;
        pat?: string;
    }

    var bifMatchDiag = false;

    function buildIfMatch(pats: TransformString[], e: Expr, seedEnv?: () => Environment, info?: MatchInfo): Expr {
        var env: Environment;
        for (var i = 0, len = pats.length; i < len; i++) {
            if (seedEnv) {
                env = seedEnv();
            }
            else {
                env = {};
            }
            if (matchS(pats[i].pattern, e, env)) {
                if ((!pats[i].exec) || (pats[i].exec(env, pats[i].param))) {
                    if (info) {
                        info.index = i;
                        info.pat = pats[i].pattern;
                    }
                    var built = buildExpr(pats[i].template, env);
                    if (bifMatchDiag) {
                        var builtTex = exprToTex(built);
                        var etex = exprToTex(e);
                        console.log("applied " + pats[i].pattern + " to " + etex + " yielding " + builtTex);
                    }
                    return built;
                }
            }
        }
        return undefined;
    }

    function foldConstants(env: Environment, opArg: { op: Operator; reverse?: boolean }) {
        var ca = <Constant>env["a"];
        var cb = <Constant>env["b"];
        if (opArg.reverse) {
            env["c"] = applyBinop({ type: ExprType.BINOP, op: opArg.op, operand1: cb, operand2: ca });
        }
        else {
            env["c"] = applyBinop({ type: ExprType.BINOP, op: opArg.op, operand1: ca, operand2: cb });
        }
        return true;
    }

    function combineCoeffs(env: Environment, opArg: { sgn: number }) {
        var aLeft = <Constant>(env["al"]||Constants.makeInt(0));
        var aRight = <Constant>env["ar"];
        var bLeft = <Constant>env["bl"];
        var bRight = <Constant>env["br"];

        // aLeft * x +/- bLeft = aRight * x +/- bRight;
        // sgn 00: -,-; 01: -,+; 10: +,-; 11: +,+
        // (aLeft-aRight) * x  = bRight-bLeft;
        var sgn = opArg.sgn;
        if ((sgn & 0x1) == 0) {
            bRight = Constants.negate(bRight);
        }
        if ((sgn & 0x2) == 0) {
            bLeft = Constants.negate(bLeft);
        }
        env["as"] = applyBinop({ type: ExprType.BINOP, op: Operator.SUB, operand1: aLeft, operand2: aRight });
        env["bs"] = applyBinop({ type: ExprType.BINOP, op: Operator.SUB, operand1: bRight, operand2: bLeft });
        return true;
    }

    function negateConstantIfNegative(env: Environment) {
        var cb = <Constant>env["b"];
        if (Constants.isNegative(cb)) {
            env["n"] = Constants.negate(cb);
            return true;
        }
        else {
            return false;
        }
    }

    function negateConstant(env: Environment) {
        var cb = <Constant>env["b"];
        env["n"] = Constants.negate(cb);
        return true;
    }

    function divrl(env: Environment) {
        var a = env["a"];
        var b = env["b"];

        if (isInt(a, 0)) {
            return false;
        }
        else {
            var q = applyBinop({ type: ExprType.BINOP, op: Operator.DIV, operand1: b, operand2: a });
            env["q"] = q;
            return true;
        }
    }

    function isFactor(expr: Expr) {
        if ((expr.type == ExprType.VARIABLE) || isConstant(expr)) {
            return true;
        }
        if (expr.type == ExprType.UNOP) {
            return isFactor((<Unop>expr).operand1);
        }
        else if (expr.type == ExprType.BINOP) {
            var binex = <Binop>expr;
            if (binex.op == Operator.EXP) {
                return (binex.operand1.type == ExprType.VARIABLE) && (binex.operand2.type == ExprType.INTEGER);
            }
        }
        return false;
    }

    function isTerm(e: Expr): boolean {
        if (e.type == ExprType.BINOP) {
            var binex = <Binop>e;
            if (binex.op == Operator.MUL) {
                return isTerm(binex.operand1) && (isFactor(binex.operand2));
            }
        }
        else if (e.type == ExprType.UNOP) {
            return isTerm((<Unop>e).operand1);
        }
        else {
            return isFactor(e);
        }
    }

    function isSumOfProducts(e: Expr): boolean {
        switch (e.type) {
            case ExprType.BINOP: {
                var binex = <Binop>e;
                if ((binex.op == Operator.ADD) || (binex.op == Operator.SUB) || (binex.op == Operator.EQ)) {
                    return isSumOfProducts(binex.operand1) && (isTerm(binex.operand2));
                }
                else if (binex.op == Operator.MUL) {
                    return isTerm(binex);
                }
                else if (binex.op == Operator.EXP) {
                    return isFactor(binex);
                }
            }
            case ExprType.UNOP: {
                return isTerm(e);
            }
            default:
                return isFactor(e);
        }
    }

   var diagB = false;
    // TODO: find correct place to check for divide by zero
    function simplifyExpr(expr: Expr, diagIndent = ""): Expr {
        var delta = true;
        while (delta) {
            delta = false;
            if (diagB) {
                let tex = exprToTexParens(expr);
                console.log(diagIndent + "simplifying " + tex);
            }
            var operand1: Expr;
            var operand2: Expr;
            switch (expr.type) {
                case ExprType.INTEGER:
                case ExprType.REAL:
                case ExprType.VARIABLE:
                    return expr;
                case ExprType.RATIONAL:
                    return Constants.simplifyRational(<Rational>expr);
                case ExprType.UNOP: {
                    // currently only unary '-'
                    var unex = <Unop>expr;
                    if (isConstant(unex.operand1)) {
                        return Constants.negate(unex.operand1);
                    }
                    else {
                        operand1 = simplifyExpr(unex.operand1, diagIndent + "  ");
                        if (operand1 != unex.operand1) {
                            delta = true;
                            expr = <Unop>{ type: ExprType.UNOP, op: unex.op, operand1: operand1 };
                        }
                    };
                    break;
                }
                case ExprType.BINOP:
                    var binex = <Binop>expr;
                    if (isConstant(binex.operand1)) {
                        if (isConstant(binex.operand2)) {
                            return applyBinop(binex);
                        }
                    }
                    var info: MatchInfo = { index: -1 };
                    var result = buildIfMatch([
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
                        { pattern: "?bl:const=?ar:const?x+?br:const", template: "?as?x=?bs", exec: combineCoeffs, param: { sgn: 3 } },
                        { pattern: "?bl:const=?ar:const?x-?br:const", template: "?as?x=?bs", exec: combineCoeffs, param: { sgn: 2 } },
                    ], binex, () => { return {}; }, info);
                    if (result) {
                        if (diagB) {
                            console.log("match " + info.index + ": " + info.pat);
                        }
                        delta = true;
                        expr = result;
                    }
                    else {
                        if (diagB) {
                            console.log("no match");
                        }
                        operand1 = simplifyExpr(binex.operand1, diagIndent + "  ");
                        operand2 = simplifyExpr(binex.operand2, diagIndent + "  ");
                        if ((operand1 != binex.operand1) || (operand2 != binex.operand2)) {
                            delta = true;
                            expr = <Binop>{ type: ExprType.BINOP, op: binex.op, operand1: operand1, operand2: operand2 };
                        }
                    }
                    break;
            }
        }
        if (diagB) {
            let tex = exprToTexParens(expr);
            console.log(diagIndent + "simplifying " + tex);
        }
        return expr;
    }

    function buildTexLine(binex: Binop, inputMode: boolean, inline = false, errorText?: string, reason?: string): string {
        var endText = " & ";
        if (binex.op == Operator.EQ) {
            var texLeft = exprToTex(binex.operand1, inputMode);
            var texRight = exprToTex(binex.operand2, inputMode);
            if (errorText && (errorText.length > 0)) {
                texRight += "\\class{err}{\\textrm{" + errorText + "}}";
            }
            if (reason) {
                endText += reason;
            }
            else {
                endText += " \\qquad";
            }
            if (inline) {
                return texLeft + "=" + texRight;
            }
            else {
                return texLeft + " & " + "=" + " & " + texRight + endText;
            }
        }
        else {
            var tex = exprToTex(binex, inputMode);
            if (errorText && (errorText.length > 0)) {
                tex += "\\class{err}{\\textrm{" + errorText + "}}";
            }
            if (reason) {
                endText += reason;
            }
            if (inline) {
                return tex;
            }
            else {
                return tex + " & & " + endText;
            }
        }
    }

    function equivalent(e: Expr, soln: Expr, v: Variable) {
        if ((e.type != ExprType.BINOP) || ((<Binop>e).op != Operator.EQ)) {
            return false;
        }
        e = simplifyExpr(e);
        e = solve(e, v);
        var solnEqn = <Binop>soln;
        var eqn = <Binop>e;
        console.log("comparing " + exprToTex(solnEqn) + " " + exprToString(eqn));
        if (eqn &&
            match(solnEqn.operand1, eqn.operand1, {}, true) &&
            match(solnEqn.operand2, eqn.operand2, {}, true)) {
            return true;
        }
        else if (eqn && match(solnEqn.operand1, eqn.operand2, {}, true) &&
            match(solnEqn.operand2, eqn.operand1, {}, true)) {
            return true;
        }
        return false;
    }

    function containsError(e: Expr): boolean {
        if (e.type == ExprType.ERROR) {
            return true;
        }
        else if (e.type == ExprType.BINOP) {
            var binex = <Binop>e;
            return containsError(binex.operand1) || containsError(binex.operand2);
        }
        else if (e.type == ExprType.UNOP) {
            return containsError((<Unop>e).operand1);
        }
        return false;
    }

    var showMath: HTMLDivElement;
    var showName: HTMLDivElement;

    function texWithErrors(s: string, hold: boolean, inline = false, soln?: Expr, v?: Variable): string {
        var tokStream = lexInput(s);
        var e = parseExpr(tokStream);
        if (showMath) {
            (<HTMLElement>showMath.childNodes[1]).innerText = s;
        }
        var errorIndex = -1;
        var extraTex = "";
        if (tokStream.index < (tokStream.tokens.length - 1)) {
            var tok = tokStreamGet(tokStream);
            while (tok.type != TokenType.EOI) {
                extraTex += TokenInfo.tokenText(tok);
                tok = tokStreamGet(tokStream);
            }
        }
        var offset = tokStream.tokens[tokStream.tokens.length - 1].offset;
        if (offset >= 0) {
            extraTex += s.substring(offset);
        }
        if (extraTex.length > 0) {
            extraTex = extraTex.replace(/\$/g, "\\$").replace(/\\/g, "\\\\");
        }
        else {
            var reason: string;
            if ((!containsError(e)) && soln && equivalent(e, soln, v)) {
                reason = "\\class{check}{\\surd}";
            }
        }
        if (hold) {
            s += "?cur";
            tokStream = lexInput(s);
            e = parseExpr(tokStream);
        }
        var tex = buildTexLine(<Binop>e, hold, inline, extraTex, reason);
        return tex;
    }

    var on = true;
    var initial = true;
    export function initMathCursor() {
        function toggleCursor() {
            if (initial) {
                //translateEqn("a", true);
            }
            var cur = document.getElementById("mcur");
            var ms = 750;
            if (cur) {
                if (on) {
                    on = false;
                    //cur.style.color = "rgb(200,200,230)";
                    cur.style.visibility = "hidden";
                }
                else {
                    on = true;
                    cur.style.visibility = "visible";
                    //cur.style.color = "black";
                    ms = 750;
                }
            }
            setTimeout(toggleCursor, ms);
        }

        setTimeout(toggleCursor, 750);
    }

    export interface InputEquation {
        text: string;
        texOut?: string;
        expr?: Expr;
    }

    export interface StringMap<T> {
        [s: string]: T;
    }

    function testPartialError(s: string) {
        console.log("trying err " + s);
        var tex = texWithErrors(s, true);
        console.log(tex);
    }

    export function testPartial() {
        testPartialError("!");
        testPartialError("11");
        testPartialError("111=");
        testPartialError("111=11");
        testPartialError("a=!");
        testPartialError("a=!41");
        testPartialError("$");

        testExpr("");
        testExpr("(");
        testExpr("(3");
        testExpr("(3-");
        testExpr("(3--");
        testExpr("(3--1");
        testExpr("(3--1)");
        testExpr("(a+(b+");
        testExpr("((a+b");
        testExpr("(3--1)/");
        testExpr("3xy+6=");
        testExpr("11");
        testExpr("111");
    }

    export function testParser2() {
        var s = "a + b";
        var e = parse(s);
        var tex = exprToTex(e, true);
        console.log(tex);
        texWithErrors(s, true);
        /*       var e = parse("-10a=2");
                if (!isSumOfProducts(e)) {
                    console.log("hmmm....");
                }
        
                //testEqn("a^2^i=0");
                testEqn("x_1^2=0");
                testEqn("7x+1=0");
                testEqn("3ab-2x+2=13");
                testEqn("ya-yb/xa-xb=0");
                testEqn("ya-yb/(xa)-xb=0");
                testEqn("7x-1=2(4x+1)");
                testEqn("7x-1=(4x+1)y");
                testEqn("-3--1=10x");
                testEqn("-2xy-3z=-2k+12");
                testEqn("-x+3=0");
                testEqn("-(-a)=a");
                */
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
        var a = { type: ExprType.VARIABLE, text: "a" };
        var x = { type: ExprType.VARIABLE, text: "x" };
        //testEqn("x+x+5x-3=2x-2", true, x);
        //testEqn("x-3+5x+x=2x-1-1",true, x);
        testEqn("x-d-3+c-yx+zx=2x-2", true, x);
        return;
        /*
        testEqn("6-6a=4a+8", true, a);
        testEqn("4a+16=14a-14", true, a);
        testEqn("4a-16=14a-14", true, a);
        testEqn("2a+1=2a-1", true, a);
        testEqn("3/(2a+1)=4/(a-1)", true,a);
        testEqn("(5--1)/(2a+1-3)=(1--2)/(a-1)", true,a);
        testEqn("(-5--1)/(2a+1-3)=(1--2)/(a-1)", true, a);
        testEqn("3xy-5=0", true, x);
        testEqn("x3-5=0", true, x);
        testEqn("3yx-5=0", true, x);
        testEqn("3yx=0", true, x);
        testEqn("x+x+5x=2x-2", true, x);
        testEqn("x+x+5x-3=2x-2", true, x);
        */
    }

    function testLCDPair(a1: number, b1: number, a2: number, b2: number) {
        var rr = Constants.lcd({ type: ExprType.RATIONAL, a: a1, b: b1 },
            { type: ExprType.RATIONAL, a: a2, b: b2 });
        var tex = exprToTex(rr.r1);
        console.log(tex);
        tex = exprToTex(rr.r2);
        console.log(tex);
    }

    export function testLCD() {
        testLCDPair(2, 3, 5, 12);
        testLCDPair(1, 5, 0, 1);
    }

    export function testMatch() {
        var env = <Environment>{};
        var eout: Expr;
        var tex: string;

        var e = parse("(6-6a)+(-4a)");
        if (!matchS("a+-bc", e, env)) {
            console.log("hmm...");
        }

        e = parse("2y-(3x-7)");
        env = {};

        if (matchS("a-(b-c)", e, env)) {
            eout = buildExpr("a+c-b", env);
            tex = exprToTex(eout);
            console.log(tex);
        }
        else {
            console.log("hmmm...");
        }
        e = parse("x4");
        env = {};
        if (matchS("?v:var?c:const", e, env)) {
            eout = buildExpr("?c?v", env);
            tex = exprToTex(eout);
            console.log(tex);
        }
        else {
            console.log("(1) hmmm...");
        }
        e = parse("ac-ad-(bc-bd)");
        env = {};
        if (matchS("a-(b-c)", e, env)) {
            eout = buildExpr("a+c-b", env);
            tex = exprToTex(eout);
            console.log(tex)
        }
        else {
            console.log("(2) hmmm...");
        }

        //e = parse("1x");
        e = parse("(3)(1)");
        env = {};
        var result = buildIfMatch([
            { pattern: "1a", template: "a" },
            { pattern: "a1", template: "a" }], e);

        if (result) {
            tex = exprToTex(result);
            console.log(tex);
        }
        else {
            console.log("(3) hmmm...");}
    }

    export function createChecker(axiomText: string, varName: string) {
        var axiom = parseExpr(lexInput(axiomText));
        var v = { type: ExprType.VARIABLE, text: varName };
        var axiomSoln = simplifyExpr(axiom);
        //console.log(exprToTex(axiomSoln));
        axiomSoln = solve(axiomSoln, v);
        //console.log(exprToTex(axiomSoln));
        return {
            axiom: axiomSoln,
            axiomText: axiomText,
            v: v,
            check: (text) => {
                var answer = false;
                try {
                    var e = parseExpr(lexInput(text));
                    answer = (!containsError(e)) && equivalent(e, axiomSoln, v); 
                }
                catch (exception) {
                    answer = false;
                }
                return answer;
            }
        };

    }
}

export interface Checker {
    axiom: Maths.Expr;
    axiomText: string;
    v: Maths.Variable;
    check: (text: string) => boolean;
}

export function createChecker(axiomText: string, varName: string): Checker {
    return Maths.createChecker(axiomText, varName);
}

function runTests() {
    // 1/(a+1)=5/4
    // -1/(a+1)=-5/4
    Maths.testSolve();
    Maths.testLCD();
    Maths.testMatch();
    Maths.testPartial();
    Maths.testNorm();
    Maths.testParser2();
}

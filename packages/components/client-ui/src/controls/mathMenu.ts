// tslint:disable:object-literal-sort-keys align
import * as MergeTree from "@prague/merge-tree";
import * as Katex from "katex";
import * as SearchMenu from "./searchMenu";

export interface IMathCommand extends SearchMenu.ISearchMenuCommand {
    arity?: number;
    infix?: boolean;
    sub?: boolean;
    exp?: boolean;
    op?: Operator;
    prec?: TokenPrecedence;
    curlies?: boolean;
    texString?: string;
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

const mathCmdTree = new MergeTree.TST<IMathCommand>();
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
    { key: "implies", op: Operator.IMPLIES},
];

const logic = [
    { key: "forall", op: Operator.FORALL },
    { key: "exists", op: Operator.EXISTS },
];

greekLetters.map((letter) => addCommand(mathCmdTree,
    { key: letter, arity: 0, texString: "\\" + letter + " " }));
bigOpsSubExp.map((name) => addCommand(mathCmdTree, {
    key: name, arity: 1, sub: true, exp: true,
    texString: "\\" + name,
}));
bigOpsSub.map((name) => addCommand(mathCmdTree, {
    key: name, arity: 1, sub: true,
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

addCommand(mathCmdTree, { key: "cos", arity: 1, exp: true, texString: "\\cos " });
addCommand(mathCmdTree, { key: "log", arity: 1, exp: true, texString: "\\log " });
addCommand(mathCmdTree, { key: "ln", arity: 1, exp: true, texString: "\\ln " });
addCommand(mathCmdTree, { key: "infty", arity: 0, texString: "\\infty " });
addCommand(mathCmdTree, { key: "Box", arity: 0, texString: "\\Box " });
addCommand(mathCmdTree, { key: "nabla", arity: 0, texString: "\\nabla " });

addCommand(mathCmdTree, { key: "partial", arity: 1, exp: true, texString: "\\partial" });
addCommand(mathCmdTree, { key: "neg", arity: 1, texString: "\\neg" });
addCommand(mathCmdTree, { key: "overline", arity: 1, texString: "\\overline{}", curlies: true });
addCommand(mathCmdTree, { key: "circ", arity: 0, texString: "\\circ" });
addCommand(mathCmdTree, { key: "sin", arity: 1, exp: true, texString: "\\sin" });
// TODO: [3] for cube root etc.
addCommand(mathCmdTree, { key: "sqrt", arity: 1, texString: "\\sqrt{}", curlies: true });
addCommand(mathCmdTree, { key: "to", arity: 0, texString: "\\to" });
addCommand(mathCmdTree, { key: "frac", arity: 2, texString: "\\frac " });

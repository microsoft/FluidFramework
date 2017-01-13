// TODO convert me
// tslint:disable

var nullDigit = -1;

export interface Item {
    key: string;
}

interface Node {
    item: Item;
    digit: number;
    l?: Node;
    m?: Node;
    r?: Node;
}

function checkAdd(tree: Node, item: Item) {
    if (!search(tree, item.key, 0)) {
        return insert(tree, item, 0);
    }
    return tree;
}

function digit(s: string, digitIndex: number) {
    if (digitIndex < s.length) {
        return s.charCodeAt(digitIndex);
    }
    else {
        return nullDigit;
    }
}

function internal(t: Node) {
    return (t.digit != nullDigit);
}

function split(p: Node, q: Node, digitIndex: number): Node {
    if (p.item.key.length > q.item.key.length) {
        var temp = p;
        p = q;
        q = temp;
    }
    var pDigit = digit(p.item.key, digitIndex);
    var qDigit = digit(q.item.key, digitIndex);
    var t = build(qDigit);
    if (pDigit < qDigit) {
        t.m = q;
        if (pDigit != nullDigit) {
            t.l = build(pDigit, p);
        }
        else {
            t.l = p;
        }
    }
    else if (pDigit === qDigit) {
        t.m = split(p, q, digitIndex + 1);
    }
    else {
        t.m = q;
        if (pDigit != nullDigit) {
            t.r = build(pDigit, p);
        }
        else {
        }
    }
    return t;
}

function search(h: Node, v: string, w: number): Item {
    if (h) {
        if (internal(h)) {
            var i = digit(v, w);
            if (i < h.digit) {
                return search(h.l, v, w);
            }
            else if (i === h.digit) {
                return search(h.m, v, w + 1);
            }
            else {
                return search(h.r, v, w);
            }
        }
        else if (v == h.item.key) {
            return h.item;
        }
    }
}

function mapItems(h: Node, fn: (item: Item) => void) {
    if (h) {
        if (internal(h)) {
            mapItems(h.l, fn);
            mapItems(h.m, fn);
            mapItems(h.r, fn);
        }
        else {
            fn(h.item);
        }
    }
}

function findAllCompletions<T extends Item>(tree: Node, prefix: string): T[] {
    var prefixTree = searchPrefix(tree, prefix, 0);
    var accum: T[] = [];
    mapItems(prefixTree, (item) => accum.push(<T>item));
    return accum;
}

function searchPrefix(tree: Node, val: string, w: number): Node {
    if (w == val.length) {
        return tree;
    }
    if (tree) {
        if (tree.item && (tree.item.key.indexOf(val) == 0)) {
            return tree;
        }
        var i = digit(val, w);
        if (i < tree.digit) {
            return searchPrefix(tree.l, val, w);
        }
        else if (i == tree.digit) {
            return searchPrefix(tree.m, val, w + 1);
        }
        else {
            return searchPrefix(tree.r, val, w);
        }
    }
}

function insert(h: Node, item: Item, w: number) {
    var v = item.key;
    var i = digit(v, w);
    if (!h) {
        return build(i, build(nullDigit, undefined, item));
    }
    if (!(internal(h))) {
        return split(build(nullDigit, undefined, item), h, w);
    }
    if (i < h.digit) {
        h.l = insert(h.l, item, w);
    }
    else if (i == h.digit) {
        h.m = insert(h.m, item, w + 1);
    }
    else {
        h.r = insert(h.r, item, w);
    }
    return h;
}

class Indenter {
    static indentStep: number = 4;
    static indentStepString: string = "    ";
    static indentStrings: string[] = [];
    public indentAmt: number = 0;

    public increaseIndent() {
        this.indentAmt += Indenter.indentStep;
    }

    public decreaseIndent() {
        this.indentAmt -= Indenter.indentStep;
    }

    public getIndent() {
        var indentString = Indenter.indentStrings[this.indentAmt];
        if (indentString === undefined) {
            indentString = "";
            for (var i = 0; i < this.indentAmt; i = i + Indenter.indentStep) {
                indentString += Indenter.indentStepString;
            }
            Indenter.indentStrings[this.indentAmt] = indentString;
        }
        return indentString;
    }
}

function print(tree: Node) {
    var indenter = new Indenter();
    pr1("root", tree);
    function pr1(label: string, t: Node) {
        if (t) {
            WScript.StdOut.Write(indenter.getIndent());
            if (internal(t) || (!t.item)) {
                WScript.StdOut.WriteLine(label + " node with digit: " + ((t.digit == nullDigit) ? "nullDigit" : String.fromCharCode(t.digit)));
            }
            else if (t.item) {
                WScript.StdOut.WriteLine(label + " leaf with key: " + t.item.key);
            }
            indenter.increaseIndent();
            pr1("left", t.l);
            pr1("middle", t.m);
            pr1("right", t.r);
            indenter.decreaseIndent();
        }
    }
}

function build(digit: number, m?: Node, item?: Item): Node {
    return {
        digit: digit,
        m: m,
        item: item,
    };
}

export interface Symtab<T extends Item> {
    add(item: T);
    complete(prefix: string): T[];
    find(key: string): T;
    print();
}

export function createSymtab<T extends Item>(): Symtab<T> {
    var tree;
    return {
        add: (item: T) => {
            tree = checkAdd(tree, item);
        },
        find: (key: string) => {
            return <T>search(tree, key, 0);
        },
        complete: (prefix: string) => {
            return findAllCompletions<T>(tree, prefix);
        },
        print: () => {
            print(tree);
        }
    }
}


interface Symbol {
    key: string;
    flags?: number;
}

function printSymbols(syms: Symbol[]) {
    for (var i = 0, len = syms.length; i < len; i++) {
        if (i > 0) {
            WScript.StdOut.Write(", ");
        }
        WScript.StdOut.Write(syms[i].key);
    }
    WScript.Echo("");
}

function test1() {
    var symtab = createSymtab<Symbol>();
    symtab.add({ key: "buffalo" });
    symtab.add({ key: "beefalo" });
    symtab.add({ key: "fungus" });
    symtab.add({ key: "sauce" });
    symtab.add({ key: "fungi" });
    symtab.add({ key: "funguy" });
    symtab.add({ key: "beet" });
    printSymbols(symtab.complete(""));
    printSymbols(symtab.complete("fun"));
    printSymbols(symtab.complete("b"));
    printSymbols(symtab.complete("be"));
}

function test2() {
    var symtab = createSymtab<Symbol>();
    symtab.add({ key: "as" });
    symtab.print();
    symtab.add({ key: "ast" });
    symtab.print();
    symtab.add({ key: "asty" });
    symtab.print();
}

function francestest() {
    var symtab = createSymtab<Symbol>();
    symtab.add({ key: "sparkles" });
    symtab.print();
    symtab.add({ key: "sparkler" });
    symtab.print();
    symtab.add({ key: "shimmer" });
    symtab.print();
    symtab.add({ key: "glow" });
    symtab.print();
    symtab.add({ key: "shine" });
    symtab.print();
    symtab.add({ key: "shone" });
    symtab.print();
    printSymbols(symtab.complete("g"));
    printSymbols(symtab.complete("s"));
    printSymbols(symtab.complete("sh"));
}

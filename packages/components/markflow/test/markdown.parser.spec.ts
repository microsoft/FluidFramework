/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { CharCode } from "@fluid-example/flow-util-lib";
import { strict as assert } from "assert";
// tslint:disable-next-line:no-import-side-effect
import "mocha";

// tslint:disable:no-bitwise
const enum LineState {
    blank           = 0,
    notBlank        = (1 << 0),
    pendingCR       = (1 << 1),
}

export class LineLexer {
    private state = LineState.blank;
    private start = 0;
    private pending = "";

    constructor(private readonly sink: (line: string, start: number, isBlank: boolean) => void) { }

    public add(chunk: string) {
        let last = 0;

        for (let i = 0; i < chunk.length; i++) {
            const c = chunk.charCodeAt(i);

            if (c === CharCode.lineFeed) {
                this.emit(chunk, last, last = i + 1);
            } else {
                if (this.state & LineState.pendingCR) {
                    this.emit(chunk, last, last = i);
                }

                switch (c) {
                    case CharCode.carriageReturn:
                        this.state |= LineState.pendingCR;
                        break;
                    case CharCode.tab:
                    case CharCode.space:
                        break;
                    default:
                        this.state |= LineState.notBlank;
                }
            }
        }

        // If any characters remain after the last line ending, add them to pending.
        if (last < chunk.length) {
            this.pending += chunk.slice(last);
        }
    }

    public close() {
        const { length } = this.pending;
        if (length > 0) {
            this.emit("", 0, 0);
        }
    }

    private emit(chunk: string, start: number, end: number) {
        const line = this.pending + chunk.slice(start, end);
        this.sink(line, this.start, (this.state & LineState.notBlank) === 0);
        this.pending = "";
        this.start += line.length;
        this.state = LineState.blank;
    }
}

// const enum BlockState {
//     none = 0,
// }

const enum Token {
    paragraph = "paragraph",
    code = "code",
}

export class BlockLexer {
    private start = 0;
    private pending = "";

    constructor(private readonly sink: (block: string, token: Token, start: number) => void) { }

    public add(line: string, start: number, isBlank: boolean) {
        if (isBlank) {
            this.emit(line, Token.paragraph);
        } else {
            this.pending += line;
        }
    }

    public close() {
        const { length } = this.pending;
        if (length > 0) {
            this.add("\n", this.start, true);
        }
    }

    private emit(line: string, token: Token) {
        const block = this.pending + line;
        this.sink(block, token, this.start);
        this.pending = "";
        this.start += block.length;
    }

    private indentedCode(line: string, start: number) {
        for (let i = 0; i < 4; i++) {
            if (line.charCodeAt(i) !== CharCode.space) {
                return false;
            }
        }
    }
}

describe("LineLexer", () => {
    let lexer: LineLexer;
    let emitted: { line: string, start: number, isBlank: boolean }[];

    beforeEach(() => {
        emitted = [];
        lexer = new LineLexer((line, start, isBlank) => {
            emitted.push({ line, start, isBlank });
        });
    });

    describe("add()", () => {
        it("LF", () => {
            lexer.add("\nx");
            assert.deepEqual([
                { line: "\n", start: 0, isBlank: true },
            ], emitted);
        });

        it("CR followed by an LF", () => {
            lexer.add("\r\nx");
            assert.deepEqual([
                { line: "\r\n", start: 0, isBlank: true },
            ], emitted);
        });

        it("CR not followed by an LF", () => {
            lexer.add("\rx");
            assert.deepEqual([
                { line: "\r", start: 0, isBlank: true },
            ], emitted);
        });

        it("Mixed", () => {
            lexer.add("0\n\n3\r\r6\r\n9\n\r\r\n");
            assert.deepEqual([
                { line: "0\n", start: 0, isBlank: false },
                { line: "\n", start: 2, isBlank: true },
                { line: "3\r", start: 3, isBlank: false },
                { line: "\r", start: 5, isBlank: true },
                { line: "6\r\n", start: 6, isBlank: false },
                { line: "9\n", start: 9, isBlank: false },
                { line: "\r", start: 11, isBlank: true },
                { line: "\r\n", start: 12, isBlank: true },
            ], emitted);
        });
    });

    describe("close()", () => {
        it("emits any pending chars", () => {
            lexer.add("0");
            lexer.close();

            assert.deepEqual([
                { line: "0", start: 0, isBlank: false },
            ], emitted);
        });

        it("emits pending CR", () => {
            lexer.add("\r");
            lexer.close();

            assert.deepEqual([
                { line: "\r", start: 0, isBlank: true },
            ], emitted);
        });

        it("emits nothing if empty", () => {
            lexer.close();
            assert.deepEqual([], emitted);
        });
    });
});

describe("BlockLexer", () => {
    let lexer: LineLexer;
    let emitted: { block: string, token: Token, start: number }[];

    beforeEach(() => {
        emitted = [];
        const blockLexer = new BlockLexer((block, token, start) => {
            emitted.push({ block, token, start });
        });
        lexer = new LineLexer(blockLexer.add.bind(blockLexer));
    });

    describe("add()", () => {
        it("Paragraph", () => {
            lexer.add("a\n\n");
            assert.deepEqual([
                { block: "a\n\n", token: Token.paragraph, start: 0 },
            ], emitted);
        });
    });
});

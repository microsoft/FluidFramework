"use strict";
// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
Object.defineProperty(exports, "__esModule", { value: true });
const IndentedWriter_1 = require("../IndentedWriter");
test('01 Demo from docs', () => {
    const indentedWriter = new IndentedWriter_1.IndentedWriter();
    indentedWriter.write('begin\n');
    indentedWriter.increaseIndent();
    indentedWriter.write('one\ntwo\n');
    indentedWriter.decreaseIndent();
    indentedWriter.increaseIndent();
    indentedWriter.decreaseIndent();
    indentedWriter.write('end');
    expect(indentedWriter.toString()).toMatchSnapshot();
});
test('02 Indent something', () => {
    const indentedWriter = new IndentedWriter_1.IndentedWriter();
    indentedWriter.write('a');
    indentedWriter.write('b');
    indentedWriter.increaseIndent();
    indentedWriter.writeLine('c');
    indentedWriter.writeLine('d');
    indentedWriter.decreaseIndent();
    indentedWriter.writeLine('e');
    indentedWriter.increaseIndent('>>> ');
    indentedWriter.writeLine();
    indentedWriter.writeLine();
    indentedWriter.writeLine('g');
    indentedWriter.decreaseIndent();
    expect(indentedWriter.toString()).toMatchSnapshot();
});
test('03 Two kinds of indents', () => {
    const indentedWriter = new IndentedWriter_1.IndentedWriter();
    indentedWriter.writeLine('---');
    indentedWriter.indentScope(() => {
        indentedWriter.write('a\nb');
        indentedWriter.indentScope(() => {
            indentedWriter.write('c\nd\n');
        });
        indentedWriter.write('e\n');
    }, '> ');
    indentedWriter.writeLine('---');
    expect(indentedWriter.toString()).toMatchSnapshot();
});
test('04 Edge cases for ensureNewLine()', () => {
    let indentedWriter = new IndentedWriter_1.IndentedWriter();
    indentedWriter.ensureNewLine();
    indentedWriter.write('line');
    expect(indentedWriter.toString()).toMatchSnapshot();
    indentedWriter = new IndentedWriter_1.IndentedWriter();
    indentedWriter.write('previous');
    indentedWriter.ensureNewLine();
    indentedWriter.write('line');
    expect(indentedWriter.toString()).toMatchSnapshot();
});
test('04 Edge cases for ensureSkippedLine()', () => {
    let indentedWriter = new IndentedWriter_1.IndentedWriter();
    indentedWriter.ensureSkippedLine();
    indentedWriter.write('line');
    expect(indentedWriter.toString()).toMatchSnapshot();
    indentedWriter = new IndentedWriter_1.IndentedWriter();
    indentedWriter.write('previous');
    indentedWriter.ensureSkippedLine();
    indentedWriter.write('line');
    expect(indentedWriter.toString()).toMatchSnapshot();
});
//# sourceMappingURL=IndentedWriter.test.js.map
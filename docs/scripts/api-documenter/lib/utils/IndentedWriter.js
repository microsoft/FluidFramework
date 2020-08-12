"use strict";
// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
Object.defineProperty(exports, "__esModule", { value: true });
const node_core_library_1 = require("@rushstack/node-core-library");
/**
 * A utility for writing indented text.
 *
 * @remarks
 *
 * Note that the indentation is inserted at the last possible opportunity.
 * For example, this code...
 *
 * ```ts
 *   writer.write('begin\n');
 *   writer.increaseIndent();
 *   writer.write('one\ntwo\n');
 *   writer.decreaseIndent();
 *   writer.increaseIndent();
 *   writer.decreaseIndent();
 *   writer.write('end');
 * ```
 *
 * ...would produce this output:
 *
 * ```
 *   begin
 *     one
 *     two
 *   end
 * ```
 */
class IndentedWriter {
    constructor(builder) {
        /**
         * The text characters used to create one level of indentation.
         * Two spaces by default.
         */
        this.defaultIndentPrefix = '  ';
        this._builder = builder === undefined ? new node_core_library_1.StringBuilder() : builder;
        this._latestChunk = undefined;
        this._previousChunk = undefined;
        this._atStartOfLine = true;
        this._indentStack = [];
        this._indentText = '';
    }
    /**
     * Retrieves the output that was built so far.
     */
    getText() {
        return this._builder.toString();
    }
    toString() {
        return this.getText();
    }
    /**
     * Increases the indentation.  Normally the indentation is two spaces,
     * however an arbitrary prefix can optional be specified.  (For example,
     * the prefix could be "// " to indent and comment simultaneously.)
     * Each call to IndentedWriter.increaseIndent() must be followed by a
     * corresponding call to IndentedWriter.decreaseIndent().
     */
    increaseIndent(indentPrefix) {
        this._indentStack.push(indentPrefix !== undefined ? indentPrefix : this.defaultIndentPrefix);
        this._updateIndentText();
    }
    /**
     * Decreases the indentation, reverting the effect of the corresponding call
     * to IndentedWriter.increaseIndent().
     */
    decreaseIndent() {
        this._indentStack.pop();
        this._updateIndentText();
    }
    /**
     * A shorthand for ensuring that increaseIndent()/decreaseIndent() occur
     * in pairs.
     */
    indentScope(scope, indentPrefix) {
        this.increaseIndent(indentPrefix);
        scope();
        this.decreaseIndent();
    }
    /**
     * Adds a newline if the file pointer is not already at the start of the line (or start of the stream).
     */
    ensureNewLine() {
        const lastCharacter = this.peekLastCharacter();
        if (lastCharacter !== '\n' && lastCharacter !== '') {
            this._writeNewLine();
        }
    }
    /**
     * Adds up to two newlines to ensure that there is a blank line above the current line.
     */
    ensureSkippedLine() {
        if (this.peekLastCharacter() !== '\n') {
            this._writeNewLine();
        }
        const secondLastCharacter = this.peekSecondLastCharacter();
        if (secondLastCharacter !== '\n' && secondLastCharacter !== '') {
            this._writeNewLine();
        }
    }
    /**
     * Returns the last character that was written, or an empty string if no characters have been written yet.
     */
    peekLastCharacter() {
        if (this._latestChunk !== undefined) {
            return this._latestChunk.substr(-1, 1);
        }
        return '';
    }
    /**
     * Returns the second to last character that was written, or an empty string if less than one characters
     * have been written yet.
     */
    peekSecondLastCharacter() {
        if (this._latestChunk !== undefined) {
            if (this._latestChunk.length > 1) {
                return this._latestChunk.substr(-2, 1);
            }
            if (this._previousChunk !== undefined) {
                return this._previousChunk.substr(-1, 1);
            }
        }
        return '';
    }
    /**
     * Writes some text to the internal string buffer, applying indentation according
     * to the current indentation level.  If the string contains multiple newlines,
     * each line will be indented separately.
     */
    write(message) {
        if (message.length === 0) {
            return;
        }
        // If there are no newline characters, then append the string verbatim
        if (!/[\r\n]/.test(message)) {
            this._writeLinePart(message);
            return;
        }
        // Otherwise split the lines and write each one individually
        let first = true;
        for (const linePart of message.split('\n')) {
            if (!first) {
                this._writeNewLine();
            }
            else {
                first = false;
            }
            if (linePart) {
                this._writeLinePart(linePart.replace(/[\r]/g, ''));
            }
        }
    }
    /**
     * A shorthand for writing an optional message, followed by a newline.
     * Indentation is applied following the semantics of IndentedWriter.write().
     */
    writeLine(message = '') {
        if (message.length > 0) {
            this.write(message);
        }
        this._writeNewLine();
    }
    /**
     * Writes a string that does not contain any newline characters.
     */
    _writeLinePart(message) {
        if (message.length > 0) {
            if (this._atStartOfLine && this._indentText.length > 0) {
                this._write(this._indentText);
            }
            this._write(message);
            this._atStartOfLine = false;
        }
    }
    _writeNewLine() {
        if (this._atStartOfLine && this._indentText.length > 0) {
            this._write(this._indentText);
        }
        this._write('\n');
        this._atStartOfLine = true;
    }
    _write(s) {
        this._previousChunk = this._latestChunk;
        this._latestChunk = s;
        this._builder.append(s);
    }
    _updateIndentText() {
        this._indentText = this._indentStack.join('');
    }
}
exports.IndentedWriter = IndentedWriter;
//# sourceMappingURL=IndentedWriter.js.map
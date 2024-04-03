/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { StringBuilder, type IStringBuilder } from "@rushstack/node-core-library";

/**
 * A utility for writing indented text.
 *
 * Can be instantiated via {@link (DocumentWriter:namespace).create}.
 *
 * @remarks Note that the indentation is inserted at the last possible opportunity.
 *
 * @example
 *
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
 *
 * @public
 */
export interface DocumentWriter {
	/**
	 * Retrieves the output that was built so far.
	 */
	getText(): string;

	/**
	 * Increases the indentation.
	 *
	 * @param indentPrefix - The character(s) to append to the line indentation.
	 * For example, the prefix could be "// " to indent and comment simultaneously.
	 * Default: 2 spaces.
	 *
	 * @remarks Each call to `increaseIndent` must be followed by a corresponding call to {@link (DocumentWriter:interface).decreaseIndent}.
	 */
	increaseIndent(indentPrefix?: string): void;

	/**
	 * Decreases the indentation, reverting the effect of the corresponding call
	 * to {@link (DocumentWriter:interface).increaseIndent}.
	 */
	decreaseIndent(): void;

	/**
	 * Adds a newline if the file pointer is not already at the start of the line (or start of the stream).
	 */
	ensureNewLine(): void;

	/**
	 * Adds up to two newlines to ensure that there is a blank line above the current line.
	 */
	ensureSkippedLine(): void;

	/**
	 * Writes some text to the internal string buffer, applying indentation according to the current indentation level.
	 * @remarks If the string contains multiple newlines, each line will be indented separately.
	 */
	write(message: string): void;

	/**
	 * A shorthand for writing an optional message, followed by a newline.
	 * @remarks Indentation is applied following the semantics of {@link (DocumentWriter:interface).write}.
	 */
	writeLine(message?: string): void;

	/**
	 * Returns the last character that was written, or and empty string if no characters have been written yet.
	 */
	peekLastCharacter(): string;

	/**
	 * Returns the second to last character that was written, or an empty string if fewer than two characters
	 * have been written yet.
	 */
	peekSecondLastCharacter(): string;
}

/**
 * {@inheritDoc (DocumentWriter:interface)}
 * @public
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace DocumentWriter {
	/**
	 * Creates a new {@link (DocumentWriter:interface)} instance.
	 */
	export function create(): DocumentWriter {
		return new _DocumentWriter();
	}
}

/**
 * The text characters used to create one level of indentation.
 * Default: 2 spaces.
 */
const defaultIndentPrefix: string = "  "; // TODO: consider using a tab instead.

/**
 * Private {@link DocumentWriter} implementation.
 */
class _DocumentWriter implements DocumentWriter {
	private readonly _builder: IStringBuilder;

	private _latestChunk: string | undefined;
	private _previousChunk: string | undefined;
	private _atStartOfLine: boolean;

	private readonly _indentStack: string[];
	private _indentText: string;

	private _beforeStack: string[];
	private _isWritingBeforeStack: boolean;

	public constructor() {
		this._builder = new StringBuilder();

		this._latestChunk = undefined;
		this._previousChunk = undefined;
		this._atStartOfLine = true;

		this._indentStack = [];
		this._indentText = "";

		this._beforeStack = [];
		this._isWritingBeforeStack = false;
	}

	/**
	 * {@inheritDoc (DocumentWriter:interface).getText}
	 */
	public getText(): string {
		return this._builder.toString();
	}

	public toString(): string {
		return this.getText();
	}

	/**
	 * {@inheritDoc (DocumentWriter:interface).increaseIndent}
	 */
	public increaseIndent(indentPrefix?: string): void {
		this._indentStack.push(indentPrefix ?? defaultIndentPrefix);
		this._updateIndentText();
	}

	/**
	 * {@inheritDoc (DocumentWriter:interface).decreaseIndent}
	 */
	public decreaseIndent(): void {
		this._indentStack.pop();
		this._updateIndentText();
	}

	/**
	 * {@inheritDoc (DocumentWriter:interface).ensureNewLine}
	 */
	public ensureNewLine(): void {
		const lastCharacter: string = this.peekLastCharacter();
		if (lastCharacter !== "\n" && lastCharacter !== "") {
			this._writeNewLine();
		}
	}

	/**
	 * {@inheritDoc (DocumentWriter:interface).ensureSkippedLine}
	 */
	public ensureSkippedLine(): void {
		if (this.peekLastCharacter() !== "\n") {
			this._writeNewLine();
		}

		const secondLastCharacter: string = this.peekSecondLastCharacter();
		if (secondLastCharacter !== "\n" && secondLastCharacter !== "") {
			this._writeNewLine();
		}
	}

	/**
	 * {@inheritDoc (DocumentWriter:interface).write}
	 */
	public write(message: string): void {
		if (message.length === 0) {
			return;
		}

		if (!this._isWritingBeforeStack) {
			this._writeBeforeStack();
		}

		// If there are no newline characters, then append the string verbatim
		if (!/[\n\r]/.test(message)) {
			this._writeLinePart(message);
			return;
		}

		// Otherwise split the lines and write each one individually
		let first: boolean = true;
		for (const linePart of message.split("\n")) {
			if (first) {
				first = false;
			} else {
				this._writeNewLine();
			}

			if (linePart) {
				this._writeLinePart(linePart.replace(/\r/g, ""));
			}
		}
	}

	/**
	 * {@inheritDoc (DocumentWriter:interface).writeLine}
	 */
	public writeLine(message?: string): void {
		if (message !== undefined && message.length > 0) {
			this.write(message);
		} else if (!this._isWritingBeforeStack) {
			this._writeBeforeStack();
		}

		this._writeNewLine();
	}

	/**
	 * {@inheritDoc (DocumentWriter:interface).peekLastCharacter}
	 */
	public peekLastCharacter(): string {
		return this._latestChunk?.slice(-1) ?? "";
	}

	/**
	 * {@inheritDoc (DocumentWriter:interface).peekSecondLastCharacter}
	 */
	public peekSecondLastCharacter(): string {
		if (this._latestChunk !== undefined) {
			if (this._latestChunk.length > 1) {
				return this._latestChunk.slice(-2, -1);
			}
			if (this._previousChunk !== undefined) {
				return this._previousChunk.slice(-1);
			}
		}
		return "";
	}

	/**
	 * Writes a string that does not contain any newline characters.
	 */
	private _writeLinePart(message: string): void {
		if (message.length > 0) {
			if (this._atStartOfLine && this._indentText.length > 0) {
				this._write(this._indentText);
			}
			this._write(message);
			this._atStartOfLine = false;
		}
	}

	private _writeNewLine(): void {
		if (this._atStartOfLine && this._indentText.length > 0) {
			this._write(this._indentText);
		}

		this._write("\n");
		this._atStartOfLine = true;
	}

	private _write(s: string): void {
		this._previousChunk = this._latestChunk;
		this._latestChunk = s;
		this._builder.append(s);
	}

	/**
	 * Writes all messages in our before stack, processing them in FIFO order. This stack is
	 * populated by the `writeTentative` method.
	 */
	private _writeBeforeStack(): void {
		this._isWritingBeforeStack = true;

		for (const message of this._beforeStack) {
			this.write(message);
		}

		this._isWritingBeforeStack = false;
		this._beforeStack = [];
	}

	private _updateIndentText(): void {
		this._indentText = this._indentStack.join("");
	}
}

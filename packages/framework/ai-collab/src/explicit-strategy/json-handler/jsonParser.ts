/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { assert } from "./debug.js";

/**
 * TBD
 */
// eslint-disable-next-line @rushstack/no-new-null
export type JsonPrimitive = string | number | boolean | null;

/**
 * TBD
 */
// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
export interface JsonObject {
	[key: string]: JsonValue;
}
/**
 * TBD
 */
export type JsonArray = JsonValue[];
/**
 * TBD
 */
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

/**
 * TBD
 */
export type JsonBuilderContext<ObjectHandle, ArrayHandle> =
	| { parentObject: ObjectHandle; key: string }
	| { parentArray: ArrayHandle };

/**
 * TBD
 */
export interface JsonBuilder<ObjectHandle, ArrayHandle> {
	addObject(context?: JsonBuilderContext<ObjectHandle, ArrayHandle>): ObjectHandle;
	addArray(context?: JsonBuilderContext<ObjectHandle, ArrayHandle>): ArrayHandle;
	addPrimitive(
		value: JsonPrimitive,
		context?: JsonBuilderContext<ObjectHandle, ArrayHandle>,
	): void;
	appendText(chars: string, context?: JsonBuilderContext<ObjectHandle, ArrayHandle>): void;
	completeContext(context?: JsonBuilderContext<ObjectHandle, ArrayHandle>): void;
	completeContainer(container: ObjectHandle | ArrayHandle): void;
}

/**
 * TBD
 */
export function contextIsObject<ObjectHandle, ArrayHandle>(
	context?: JsonBuilderContext<ObjectHandle, ArrayHandle>,
): context is { parentObject: ObjectHandle; key: string } {
	return context !== undefined && "parentObject" in context;
}

/**
 * TBD
 */
export interface StreamedJsonParser {
	addChars(text: string): void;
}

/**
 * TBD
 */
export function createStreamedJsonParser<ObjectHandle, ArrayHandle>(
	builder: JsonBuilder<ObjectHandle, ArrayHandle>,
	abortController: AbortController,
): StreamedJsonParser {
	return new JsonParserImpl(builder, abortController);
}

// Implementation

const smoothStreaming = false;

// prettier-ignore
enum State {
	Start,
	End,

	InsideObjectAtStart,
	InsideObjectAfterKey,
	InsideObjectAfterColon,
	InsideObjectAfterProperty,
	InsideObjectAfterComma,
	InsideArrayAtStart,
	InsideArrayAfterElement,
	InsideArrayAfterComma,
	InsideMarkdownAtStart,
	InsideMarkdownAtEnd,

	// Special states while processing multi-character tokens (which may not arrive all at once)
	InsideKeyword,
	InsideNumber,
	InsideKey,
	InsideString,
	InsideLeadingMarkdownDelimiter,
	InsideTrailingMarkdownDelimiter,

	// Special momentary state
	Pop,
}

// Grammar productions - includes individual tokens
// prettier-ignore
enum Production {
	Value,
	Key,
	Colon,
	Comma,
	CloseBrace,
	CloseBracket,
	LeadingMarkdownDelimiter,
	TrailingMarkdownDelimiter,
}

type StateTransition = [Production, State];

// prettier-ignore
const stateTransitionTable = new Map<State, StateTransition[]>([
	[
		State.Start,
		[
			[Production.Value, State.End],
			[Production.LeadingMarkdownDelimiter, State.InsideMarkdownAtStart],
		],
	],
	[
		State.InsideObjectAtStart,
		[
			[Production.Key, State.InsideObjectAfterKey],
			[Production.CloseBrace, State.Pop],
		],
	],
	[State.InsideObjectAfterKey, [[Production.Colon, State.InsideObjectAfterColon]]],
	[State.InsideObjectAfterColon, [[Production.Value, State.InsideObjectAfterProperty]]],
	[
		State.InsideObjectAfterProperty,
		[
			[Production.Comma, State.InsideObjectAfterComma],
			[Production.CloseBrace, State.Pop],
		],
	],
	[State.InsideObjectAfterComma, [[Production.Key, State.InsideObjectAfterKey]]],
	[
		State.InsideArrayAtStart,
		[
			[Production.Value, State.InsideArrayAfterElement],
			[Production.CloseBracket, State.Pop],
		],
	],
	[
		State.InsideArrayAfterElement,
		[
			[Production.Comma, State.InsideArrayAfterComma],
			[Production.CloseBracket, State.Pop],
		],
	],
	[State.InsideArrayAfterComma, [[Production.Value, State.InsideArrayAfterElement]]],
	[State.InsideMarkdownAtStart, [[Production.Value, State.InsideMarkdownAtEnd]]],
	[State.InsideMarkdownAtEnd, [[Production.TrailingMarkdownDelimiter, State.End]]],
]);

const keywords = ["true", "false", "null"];
// eslint-disable-next-line unicorn/no-null
const keywordValues = [true, false, null];

interface ParserContext<ObjectHandle, ArrayHandle> {
	state: State;
	firstToken: string;
	parentObject?: ObjectHandle;
	key?: string;
	parentArray?: ArrayHandle;
}

class JsonParserImpl<ObjectHandle, ArrayHandle> implements StreamedJsonParser {
	public constructor(
		private readonly builder: JsonBuilder<ObjectHandle, ArrayHandle>,
		private readonly abortController: AbortController,
	) {}

	public addChars(text: string): void {
		this.buffer += text;

		if (!this.throttled) {
			while (this.processJsonText()) {
				// Process as much of the buffer as possible
			}
		}
	}

	// Implementation

	private buffer: string = ""; // This could be something more efficient
	private throttled = false;
	private readonly contexts: ParserContext<ObjectHandle, ArrayHandle>[] = [
		{ state: State.Start, firstToken: "" },
	];

	// Returns true if another token should be processed
	private processJsonText(): boolean {
		// Exit if there's nothing to process or the fetch has been aborted
		if (this.buffer.length === 0 || this.abortController.signal.aborted) {
			return false;
		}

		const state = this.contexts[this.contexts.length - 1]!.state;

		// Are we in the midst of a multi-character token?
		switch (state) {
			case State.InsideKeyword:
				return this.processJsonKeyword();

			case State.InsideNumber:
				return this.processJsonNumber();

			case State.InsideKey:
				return this.processJsonKey();

			case State.InsideString:
				return this.processJsonStringCharacters();

			case State.InsideLeadingMarkdownDelimiter:
				return this.processLeadingMarkdownDelimiter();

			case State.InsideTrailingMarkdownDelimiter:
				return this.processTrailingMarkdownDelimiter();

			default:
				break;
		}

		// We're between tokens, so trim leading whitespace
		// this.buffer = this.buffer.trimStart(); // REVIEW: Requires es2019 or later
		this.buffer = this.buffer.replace(/^\s+/, "");

		// Again, exit if there's nothing left to process
		if (this.buffer.length === 0) {
			return false;
		}

		// If we're already done, there shouldn't be anything left to process
		if (state === State.End) {
			// REVIEW: Shouldn't be necessary with GPT4o, especially with Structured Output
			this.buffer = "";
			return false;
			// throw new Error("JSON already complete");
		}

		const builderContext = this.builderContextFromParserContext(
			this.contexts[this.contexts.length - 1]!,
		)!;

		// Start a new token
		const char = this.buffer[0]!;
		// eslint-disable-next-line unicorn/prefer-code-point
		const charCode = char.charCodeAt(0);

		switch (charCode) {
			case 123: // '{'
				this.consumeCharAndPush(State.InsideObjectAtStart, {
					parentObject: this.builder.addObject(builderContext),
				});
				break;
			case 58: // ':'
				this.consumeCharAndEnterNextState(Production.Colon);
				break;
			case 44: // ','
				this.consumeCharAndEnterNextState(Production.Comma);
				break;
			case 125: // '}'
				this.consumeCharAndEnterNextState(Production.CloseBrace);
				break;
			case 91: // '['
				this.consumeCharAndPush(State.InsideArrayAtStart, {
					parentArray: this.builder.addArray(builderContext),
				});
				break;
			case 93: // ']'
				this.consumeCharAndEnterNextState(Production.CloseBracket);
				break;
			case 34: // '"'
				if (state === State.InsideObjectAtStart || state === State.InsideObjectAfterComma) {
					// Keys shouldn't be updated incrementally, so wait until the complete key has arrived
					this.pushContext(State.InsideKey, char);
				} else {
					this.builder.addPrimitive("", builderContext);
					this.consumeCharAndPush(State.InsideString);
				}
				break;
			case 116: // 't'
			case 102: // 'f'
			case 110: // 'n'
				this.pushContext(State.InsideKeyword, char);
				break;
			case 45: // '-'
				this.pushContext(State.InsideNumber, char);
				break;
			default:
				if (charCode >= 48 && charCode <= 57) {
					// '0' - '9'
					this.pushContext(State.InsideNumber, char);
				} else if (charCode === 96) {
					// '`'
					if (state === State.Start) {
						this.pushContext(State.InsideLeadingMarkdownDelimiter, char);
					} else if (state === State.InsideMarkdownAtEnd) {
						this.pushContext(State.InsideTrailingMarkdownDelimiter, char);
					} else {
						this.unexpectedTokenError(char);
					}
				} else {
					this.unexpectedTokenError(char);
				}
				break;
		}

		return this.buffer.length > 0;
	}

	private processLeadingMarkdownDelimiter(): boolean {
		const leadingMarkdownDelimiter = "```json";
		if (this.buffer.startsWith(leadingMarkdownDelimiter)) {
			this.buffer = this.buffer.slice(leadingMarkdownDelimiter.length);
			this.popContext(Production.LeadingMarkdownDelimiter);
			return this.buffer.length > 0;
		}

		return false;
	}

	private processTrailingMarkdownDelimiter(): boolean {
		const trailingMarkdownDelimiter = "```";
		if (this.buffer.startsWith(trailingMarkdownDelimiter)) {
			this.buffer = this.buffer.slice(trailingMarkdownDelimiter.length);
			this.popContext(Production.TrailingMarkdownDelimiter);
			return this.buffer.length > 0;
		}

		return false;
	}

	private processJsonKeyword(): boolean {
		// Just match the keyword, let the next iteration handle the next characters
		for (let i = 0; i < keywords.length; i++) {
			const keyword = keywords[i]!;
			if (this.buffer.startsWith(keyword)) {
				this.buffer = this.buffer.slice(keyword.length);
				this.setPrimitiveValueAndPop(keywordValues[i]!);
				return true;
			} else if (keyword.startsWith(this.buffer)) {
				return false;
			}
		}

		this.unexpectedTokenError(this.buffer);
		return false;
	}

	private processJsonNumber(): boolean {
		// Match the number plus a single non-number character (so we know the number is complete)
		const jsonNumber = /^-?(0|([1-9]\d*))(\.\d+)?([Ee][+-]?\d+)?(?=\s|\D)/;
		const match = this.buffer.match(jsonNumber);
		if (match) {
			const numberText = match[0];
			this.buffer = this.buffer.slice(numberText.length);
			this.setPrimitiveValueAndPop(+numberText); // Unary + parses the numeric string
			return true;
		}

		return false;
	}

	private processJsonKey(): boolean {
		// Match the complete string, including start and end quotes
		assert(this.buffer.startsWith('"'));
		const jsonStringRegex = /^"((?:[^"\\]|\\.)*)"/;
		const match = this.buffer.match(jsonStringRegex);

		if (match) {
			const keyText = match[0];
			this.buffer = this.buffer.slice(keyText.length);
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			const key = JSON.parse(keyText);

			assert(this.contexts.length > 1);
			const parentContext = this.contexts[this.contexts.length - 2]!;
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			parentContext.key = key;

			this.popContext(Production.Key);
			return true;
		}

		return false;
	}

	// String values are special because we might stream them
	private processJsonStringCharacters(): boolean {
		let maxCount = Number.POSITIVE_INFINITY;

		if (smoothStreaming) {
			maxCount = 5;
		}

		this.appendText(this.convertJsonStringCharacters(maxCount));

		if (this.buffer.startsWith('"')) {
			// The end of the string was reached
			this.buffer = this.buffer.slice(1);
			this.completePrimitiveAndPop();
			return this.buffer.length > 0;
		} else if (this.buffer.length > 0) {
			this.throttled = true;
			setTimeout(() => {
				this.throttled = false;
				while (this.processJsonText()) {
					// Process characters until it's time to pause again
				}
			}, 15);
		}

		return false;
	}

	private convertJsonStringCharacters(maxCount: number): string {
		let escapeNext = false;

		let i = 0;
		for (; i < Math.min(maxCount, this.buffer.length); i++) {
			const char = this.buffer[i];

			if (escapeNext) {
				escapeNext = false; // JSON.parse will ensure valid escape sequence
			} else if (char === "\\") {
				escapeNext = true;
			} else if (char === '"') {
				// Unescaped " is reached
				break;
			}
		}

		if (escapeNext) {
			// Buffer ends with a single '\' character
			i--;
		}

		const result = this.buffer.slice(0, i);
		this.buffer = this.buffer.slice(i);
		return JSON.parse(`"${result}"`) as string;
	}

	private appendText(text: string): void {
		assert(this.contexts.length > 1);
		const builderContext = this.builderContextFromParserContext(
			this.contexts[this.contexts.length - 2]!,
		)!;
		this.builder.appendText(text, builderContext);
	}

	private consumeCharAndPush(
		state: State,
		parent?: { parentObject?: ObjectHandle; parentArray?: ArrayHandle },
	): void {
		const firstToken = this.buffer[0]!;
		this.buffer = this.buffer.slice(1);
		this.pushContext(state, firstToken, parent);
	}

	private pushContext(
		state: State,
		firstToken: string,
		parent?: { parentObject?: ObjectHandle; parentArray?: ArrayHandle },
	): void {
		this.contexts.push({
			state,
			firstToken,
			parentObject: parent?.parentObject,
			parentArray: parent?.parentArray,
		});
	}

	private setPrimitiveValueAndPop(value: JsonPrimitive): void {
		this.builder.addPrimitive(
			value,
			this.builderContextFromParserContext(this.contexts[this.contexts.length - 2]!),
		);
		this.completePrimitiveAndPop();
	}

	private completePrimitiveAndPop(): void {
		this.builder.completeContext(
			this.builderContextFromParserContext(this.contexts[this.contexts.length - 2]!),
		);
		this.popContext(Production.Value);
	}

	private completeAndPopContext(): void {
		const context = this.contexts[this.contexts.length - 1]!;
		if (context.parentObject !== undefined) {
			this.builder.completeContainer?.(context.parentObject);
		} else if (context.parentArray !== undefined) {
			this.builder.completeContainer?.(context.parentArray);
		}
		this.builder.completeContext?.(
			this.builderContextFromParserContext(this.contexts[this.contexts.length - 2]!),
		);
		this.popContext();
	}

	private builderContextFromParserContext(
		context: ParserContext<ObjectHandle, ArrayHandle>,
	): JsonBuilderContext<ObjectHandle, ArrayHandle> | undefined {
		if (context.parentObject !== undefined) {
			return { parentObject: context.parentObject, key: context.key! };
			// eslint-disable-next-line unicorn/no-negated-condition
		} else if (context.parentArray !== undefined) {
			return { parentArray: context.parentArray };
		} else {
			return undefined;
		}
	}

	private popContext(production = Production.Value): void {
		assert(this.contexts.length > 1);
		const poppedContext = this.contexts.pop()!;
		this.nextState(poppedContext.firstToken, production);
	}

	private consumeCharAndEnterNextState(production: Production): void {
		const token = this.buffer[0]!;
		this.buffer = this.buffer.slice(1);
		this.nextState(token, production);
	}

	private nextState(token: string, production: Production): void {
		const context = this.contexts[this.contexts.length - 1]!;

		const stateTransitions = stateTransitionTable.get(context.state);
		assert(stateTransitions !== undefined);
		for (const [productionCandidate, nextState] of stateTransitions!) {
			if (productionCandidate === production) {
				if (nextState === State.Pop) {
					this.completeAndPopContext();
				} else {
					context.state = nextState;
				}
				return;
			}
		}

		this.unexpectedTokenError(token);
	}

	private unexpectedTokenError(token: string): void {
		throw new Error(`Unexpected token ${token}`);
	}
}

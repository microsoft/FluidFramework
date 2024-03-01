/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This tool cleans up a message.json file downloaded through fluid-fetch to remove
 * user content and user identifying information.  Enough information can be retained
 * to allow loading through Fluid Preview, or everything can be scrubbed so that only
 * replay-tool can read the result.  Anonymous identifying information such as client
 * IDs are always retained.  Object keys are NOT scrubbed, including those that are
 * nested within values (only leaf values are scrubbed).
 *
 * Note: While user content/information is scrubbed, it should not be assumed to be
 * fully anonymized because certain meta-information (such as word lengths and
 * consistent replacement) are preserved.
 *
 * Messages must match known structures when scrubbing for Fluid Preview.
 */

import * as Validator from "jsonschema";
import { assert } from "@fluidframework/core-utils";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import {
	attachContentsSchema,
	chunkedOpContentsSchema,
	joinContentsSchema,
	joinDataSchema,
	opContentsMapSchema,
	opContentsSchema,
	opContentsMergeTreeDeltaOpSchema,
	opContentsMergeTreeGroupOpSchema,
	opContentsRegisterCollectionSchema,
	proposeContentsSchema,
} from "./messageSchema.js";

enum TextType {
	Generic,
	Email,
	Name,
	FluidObject,
	MapKey,
}

// Workaround to jsonschema package not supporting "false" as a schema
// that matches nothing
const falseResult = {
	valid: false,
	toString: () => {
		return "Unmatched format";
	},
};

/**
 * Class that takes chunkedOp messages and can provide their concatenated
 * contents along with re-write sanitized content in-place back into the
 * messages.  Assumes sanitized messages are always less than or equal in
 * size to the original message.
 */
class ChunkedOpProcessor {
	/**
	 * Message references so we can replace their contents in-place.  These can
	 * be top-level chunkedOp messages, or top-level op messages with a chunkedOp
	 * within the contents
	 */
	private messages = new Array<any>();
	/**
	 * The messages' parsed contents for processing.  Should parallel the
	 * messages member
	 */
	private parsedMessageContents = new Array<any>();
	private writtenBack = false;
	/**
	 * keep track of the total starting length to make sure we don't somehow end
	 * up with more content than we started with (meaning we may not be able to
	 * write it back)
	 */
	private concatenatedLength = 0;

	constructor(
		readonly validateSchemaFn: (object: any, schema: any) => boolean,
		readonly debug: boolean,
	) {}

	debugMsg(msg: any) {
		if (this.debug) {
			console.error(msg);
		}
	}

	addMessage(message: any): void {
		this.messages.push(message);

		let parsed;
		try {
			parsed = JSON.parse(message.contents);
			if (message.type === "op") {
				// nested within a regular op
				// need to go deeper to get the desired contents
				parsed = parsed.contents;
			}
		} catch (e) {
			this.debugMsg(e);
			this.debugMsg(message.contents);
		}
		this.validateSchemaFn(parsed, chunkedOpContentsSchema);
		this.parsedMessageContents.push(parsed);
	}

	hasAllMessages(): boolean {
		const lastMsgContents = this.parsedMessageContents[this.parsedMessageContents.length - 1];
		return (
			lastMsgContents.chunkId !== undefined &&
			lastMsgContents.chunkId === lastMsgContents.totalChunks
		);
	}

	/**
	 * @returns The concatenated contents of all the messages parsed as json
	 */
	getConcatenatedContents(): any {
		const contentsString = this.parsedMessageContents.reduce(
			(previousValue: string, currentValue: any) => {
				return previousValue + (currentValue.contents as string);
			},
			"",
		);

		this.concatenatedLength = contentsString.length;
		try {
			return JSON.parse(contentsString);
		} catch (e) {
			this.debugMsg(contentsString);
			this.debugMsg(e);
			return undefined;
		}
	}

	/**
	 * Write back sanitized contents into the messages.  The contents are
	 * stringified, split up, and written in place to the messages that
	 * were added earlier.  The number of messages is preserved.
	 * @param contents - Sanitized contents to write back
	 */
	writeSanitizedContents(contents: any): void {
		// Write back a chunk size equal to the original
		const chunkSize = this.parsedMessageContents[0].contents.length;

		let stringified: string;
		try {
			stringified = JSON.stringify(contents);
			assert(
				stringified.length <= this.concatenatedLength,
				0x089 /* "Stringified length of chunk contents > total starting length" */,
			);
		} catch (e) {
			this.debugMsg(e);
			throw e;
		}

		for (let i = 0; i < this.messages.length; i++) {
			const substring = stringified.substring(i * chunkSize, (i + 1) * chunkSize);

			const parsedContents = this.parsedMessageContents[i];
			parsedContents.contents = substring;
			const message = this.messages[i];

			let stringifiedParsedContents;
			try {
				// for nested chunkedOps, we need to recreate the extra nesting layer
				// we removed earlier when adding the message
				if (message.type === "op") {
					const nestingLayer = {
						type: "chunkedOp",
						contents: parsedContents,
					};
					stringifiedParsedContents = JSON.stringify(nestingLayer);
				} else {
					stringifiedParsedContents = JSON.stringify(parsedContents);
				}
			} catch (e) {
				this.debugMsg(e);
			}

			message.contents = stringifiedParsedContents;
		}

		this.writtenBack = true;
	}

	reset(): void {
		assert(
			this.writtenBack,
			0x08a /* "resetting ChunkedOpProcessor that never wrote back its contents" */,
		);
		this.messages = new Array<any>();
		this.parsedMessageContents = new Array<any>();
		this.writtenBack = false;
		this.concatenatedLength = 0;
	}

	isPendingProcessing(): boolean {
		return this.messages.length !== 0;
	}
}

export class Sanitizer {
	readonly validator = new Validator.Validator();
	// Represents the keys used to store Fluid object identifiers, snapshot info,
	// and other string fields that should not be replaced in contents blobs to
	// ensure the messages are still usable
	readonly defaultExcludedKeys = new Set<string>();
	// Represents the keys used by merge-tree ops their "seg" property, where other
	// keys represent user information
	readonly mergeTreeExcludedKeys = new Set<string>();
	// Map of user information to what it was replaced with.  Used to ensure the same
	// data have the same replacements
	readonly replacementMap = new Map<string, string>();

	/**
	 * Validate that the provided message matches the provided schema.
	 * For a full scrub, warn and continue (scrubber should fully sanitize unexpected
	 * fields for ops), otherwise throw an error because we cannot be sure user
	 * information is being sufficiently sanitized.
	 */
	objectMatchesSchema = (object: any, schema: any): boolean => {
		const result = schema === false ? falseResult : this.validator.validate(object, schema);
		if (!result.valid) {
			const errorMsg = `Bad msg fmt:\n${result.toString()}\n${JSON.stringify(
				object,
				undefined,
				2,
			)}`;

			if (this.fullScrub || this.noBail) {
				this.debugMsg(errorMsg);
			} else {
				throw new Error(errorMsg);
			}
		}
		return result.valid;
	};

	readonly chunkProcessor = new ChunkedOpProcessor(this.objectMatchesSchema, this.debug);

	constructor(
		readonly messages: ISequencedDocumentMessage[],
		readonly fullScrub: boolean,
		readonly noBail: boolean,
		readonly debug: boolean = false,
	) {
		this.defaultExcludedKeys.add("type");
		this.defaultExcludedKeys.add("id");
		this.defaultExcludedKeys.add("pkg");
		this.defaultExcludedKeys.add("snapshotFormatVersion");
		this.defaultExcludedKeys.add("packageVersion");
		this.mergeTreeExcludedKeys.add("nodeType");
	}

	debugMsg(msg: any) {
		if (this.debug) {
			console.error(msg);
		}
	}

	isFluidObjectKey(key: string): boolean {
		return key === "type" || key === "id";
	}

	getRandomText(len: number): string {
		let str = "";
		while (str.length < len) {
			str = str + Math.random().toString(36).substring(2);
		}
		return str.substr(0, len);
	}

	readonly wordTokenRegex = /\S+/g;

	readonly replaceRandomTextFn = (match: string): string => {
		if (this.replacementMap.has(match)) {
			return this.replacementMap.get(match)!;
		}

		const replacement = this.getRandomText(match.length);
		this.replacementMap.set(match, replacement);
		return replacement;
	};

	/**
	 * Replace text with garbage.  FluidObject types are not replaced when not under
	 * full scrub mode.  All other text is replaced consistently.
	 */
	replaceText(input?: string, type: TextType = TextType.Generic): string | undefined {
		if (input === undefined) {
			return undefined;
		}

		if (type === TextType.FluidObject) {
			if (this.replacementMap.has(input)) {
				return this.replacementMap.get(input)!;
			}

			const replacement = this.fullScrub ? this.getRandomText(input.length) : input;

			this.replacementMap.set(input, replacement);
			return replacement;
		}

		return input.replace(this.wordTokenRegex, this.replaceRandomTextFn);
	}

	replaceArray(input: any[]): any[] {
		for (let i = 0; i < input.length; i++) {
			const value = input[i];
			if (typeof value === "string") {
				input[i] = this.replaceText(value);
			} else if (Array.isArray(value)) {
				input[i] = this.replaceArray(value);
			} else if (typeof value === "object") {
				input[i] = this.replaceObject(value);
			}
		}
		return input;
	}

	/**
	 * (sort of) recurses down the values of a JSON object to sanitize all its strings
	 * (only checks strings, arrays, and objects)
	 * @param input - The object to sanitize
	 * @param excludedKeys - object keys for which to skip replacement when not in fullScrub
	 */
	replaceObject(
		// eslint-disable-next-line @rushstack/no-new-null
		input: object | null,
		excludedKeys: Set<string> = this.defaultExcludedKeys,
		// eslint-disable-next-line @rushstack/no-new-null
	): object | null {
		// File might contain actual nulls
		if (input === null || input === undefined) {
			return input;
		}

		const keys = Object.keys(input);
		keys.forEach((key) => {
			if (this.fullScrub || !excludedKeys.has(key)) {
				const value = input[key];
				if (typeof value === "string") {
					input[key] = this.replaceText(
						value,
						this.isFluidObjectKey(key) ? TextType.FluidObject : TextType.Generic,
					);
				} else if (Array.isArray(value)) {
					input[key] = this.replaceArray(value);
				} else if (typeof value === "object") {
					input[key] = this.replaceObject(value, excludedKeys);
				}
			}
		});
		return input;
	}

	/**
	 * Replacement on an unknown type or a parsed root level object
	 * without a key
	 * @param input - The object to sanitize
	 * @param excludedKeys - object keys for which to skip replacement when not in fullScrub
	 */
	replaceAny(input: any, excludedKeys: Set<string> = this.defaultExcludedKeys): any {
		if (input === null || input === undefined) {
			return input;
		}

		if (typeof input === "string") {
			return this.replaceText(input);
		} else if (Array.isArray(input)) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			return this.replaceArray(input);
		} else if (typeof input === "object") {
			return this.replaceObject(input, excludedKeys);
		}

		// Don't run replacement on any other types
		return input;
	}

	fixJoin(message: any) {
		if (!this.objectMatchesSchema(message.contents, joinContentsSchema)) {
			message.contents = this.replaceAny(message.contents);
		}

		try {
			let data = JSON.parse(message.data);
			if (!this.objectMatchesSchema(data, joinDataSchema)) {
				data = this.replaceAny(data);
			} else {
				const user = data.detail.user;
				user.id = this.replaceText(user.id, TextType.Email);
				user.email = this.replaceText(user.email, TextType.Email);
				user.name = this.replaceText(user.name, TextType.Name);
			}

			message.data = JSON.stringify(data);
		} catch (e) {
			this.debugMsg(e);
		}
	}

	fixPropose(message: any) {
		if (!this.objectMatchesSchema(message.contents, proposeContentsSchema)) {
			message.contents = this.replaceAny(message.contents);
		} else {
			if (typeof message.contents === "string") {
				try {
					const data = JSON.parse(message.contents);
					if (this.fullScrub) {
						const pkg = data.value?.package;
						if (pkg?.name) {
							pkg.name = this.replaceText(pkg.name, TextType.FluidObject);
						}
						if (Array.isArray(pkg?.fluid?.browser?.umd?.files)) {
							pkg.fluid.browser.umd.files = this.replaceArray(
								pkg.fluid.browser.umd.files,
							);
						}
					}
				} catch (e) {
					this.debugMsg(e);
				}
			} else {
				if (this.fullScrub) {
					message.contents.value = this.replaceText(
						message.contents.value,
						TextType.FluidObject,
					);
				}
			}
		}
	}

	fixAttachEntries(entries: any[]) {
		entries.forEach((element) => {
			// Tree type
			if (element.value.entries) {
				this.fixAttachEntries(element.value.entries);
			} else {
				// Blob (leaf) type
				try {
					if (typeof element.value.contents === "string") {
						let data = JSON.parse(element.value.contents);
						data = this.replaceObject(data);
						element.value.contents = JSON.stringify(data);
					}
				} catch (e) {
					this.debugMsg(e);
				}
			}
		});
	}

	/**
	 * Fix the content of an attach in place
	 * @param contents - contents object to fix
	 */
	fixAttachContents(contents: any): any {
		assert(
			typeof contents === "object",
			0x08b /* "Unexpected type on contents for fix of an attach!" */,
		);
		if (!this.objectMatchesSchema(contents, attachContentsSchema)) {
			this.replaceObject(contents);
		} else {
			if (this.fullScrub) {
				contents.id = this.replaceText(contents.id, TextType.FluidObject);
				contents.type = this.replaceText(contents.type, TextType.FluidObject);
			}

			this.fixAttachEntries(contents.snapshot.entries);
		}
	}

	/**
	 * Fix an attach message at the root level or a ContainerMessageType attach.  Attach
	 * messages found within an op message should instead have their contents parsed out
	 * and sent to fixAttachContents.
	 * @param message - The attach message to fix
	 * @param withinOp - If the message is from within an op message (as opposed to being
	 * an attach message at the root level).  Root level attach messages have "snapshot"
	 * under a "contents" key, whereas attach messages from within an op message have it
	 * under a "content" key
	 */
	fixAttach(message: any) {
		// Handle case where contents is stringified json
		if (typeof message.contents === "string") {
			try {
				const data = JSON.parse(message.contents);
				this.fixAttachContents(data);
				message.contents = JSON.stringify(data);
			} catch (e) {
				this.debugMsg(e);
				return;
			}
		} else {
			this.fixAttachContents(message.contents);
		}
	}

	fixDeltaOp(deltaOp: any) {
		deltaOp.seg =
			typeof deltaOp.seg === "string"
				? this.replaceText(deltaOp.seg)
				: this.replaceObject(deltaOp.seg, this.mergeTreeExcludedKeys);
	}

	/**
	 * Fix the contents object for an op message.  Does not do extra type handling.  Does
	 * not handle special container message types like "attach", "component", and
	 * "chunkedOp" (these should be handled by the caller)
	 * @param contents - The contents object for an op message.  If it was a string in the
	 * message, it must have been converted to an object first
	 */
	fixOpContentsObject(contents: any) {
		// do replacement
		if (!this.objectMatchesSchema(contents, opContentsSchema)) {
			this.replaceAny(contents);
		} else {
			if (this.fullScrub) {
				contents.address = this.replaceText(contents.address, TextType.FluidObject);
			}

			const innerContent = contents.contents.content;
			assert(
				innerContent !== undefined,
				0x08c /* "innerContent for fixing op contents is undefined!" */,
			);
			if (contents.contents.type === "attach") {
				// attach op
				// handle case where inner content is stringified json
				if (typeof contents.contents.content === "string") {
					try {
						const data = JSON.parse(contents.contents.content);
						this.fixAttachContents(data);
						contents.contents.content = JSON.stringify(data);
					} catch (e) {
						this.debugMsg(e);
					}
				} else {
					this.fixAttachContents(contents.contents.content);
				}
			} else if (this.validator.validate(innerContent, opContentsMapSchema).valid) {
				// map op
				if (this.fullScrub) {
					innerContent.address = this.replaceText(
						innerContent.address,
						TextType.FluidObject,
					);
					innerContent.contents.key = this.replaceText(
						innerContent.contents.key,
						TextType.MapKey,
					);
				}
				if (innerContent.contents.value !== undefined) {
					innerContent.contents.value.value = this.replaceAny(
						innerContent.contents.value.value,
					);
				}
			} else if (
				this.validator.validate(innerContent, opContentsMergeTreeGroupOpSchema).valid
			) {
				// merge tree group op
				if (this.fullScrub) {
					innerContent.address = this.replaceText(
						innerContent.address,
						TextType.FluidObject,
					);
				}
				innerContent.contents.ops.forEach((deltaOp) => {
					this.fixDeltaOp(deltaOp);
				});
			} else if (
				this.validator.validate(innerContent, opContentsMergeTreeDeltaOpSchema).valid
			) {
				// merge tree delta op
				if (this.fullScrub) {
					innerContent.address = this.replaceText(
						innerContent.address,
						TextType.FluidObject,
					);
				}
				this.fixDeltaOp(innerContent.contents);
			} else if (
				this.validator.validate(innerContent, opContentsRegisterCollectionSchema).valid
			) {
				// register collection op
				if (this.fullScrub) {
					innerContent.address = this.replaceText(
						innerContent.address,
						TextType.FluidObject,
					);
					innerContent.contents.key = this.replaceText(
						innerContent.contents.key,
						TextType.MapKey,
					);
				}
				if (innerContent.contents.value !== undefined) {
					innerContent.contents.value.value = this.replaceAny(
						innerContent.contents.value.value,
					);
				}
			} else {
				// message contents don't match any known op format
				this.objectMatchesSchema(contents, false);
			}
		}
	}

	fixOp(message: any) {
		// handle case where contents is stringified json
		let msgContents;
		if (typeof message.contents === "string") {
			try {
				msgContents = JSON.parse(message.contents);
			} catch (e) {
				this.debugMsg(e);
				return;
			}
		} else {
			msgContents = message.contents;
		}

		// handle container message types
		switch (msgContents.type) {
			case "attach": {
				// this one is like a regular attach op, except its contents aren't nested as deep
				// run fixAttach directly and return
				this.fixAttach(msgContents);
				break;
			}
			case "component": {
				// this one functionally nests its contents one layer deeper
				// bring up the contents object and continue as usual
				this.fixOpContentsObject(msgContents.contents);
				break;
			}
			case "chunkedOp": {
				// this is a (regular?) op split into multiple parts due to size, e.g. because it
				// has an attached image, and where the chunkedOp is within the top-level op's contents
				// (as opposed to being at the top-level).  The contents of the chunks need to be
				// concatenated to form the complete stringified json object
				// Early return here to skip re-stringify because no changes are made until the last
				// chunk, and the ChunkedOpProcessor will handle everything at that point
				return this.fixChunkedOp(message);
			}
			case "blobAttach": {
				// TODO: handle this properly once blob api is used
				this.debugMsg("TODO: blobAttach ops are skipped/unhandled");
				return;
			}
			default: {
				// A regular op
				this.fixOpContentsObject(msgContents);
			}
		}

		// re-stringify the json if needed
		if (typeof message.contents === "string") {
			try {
				message.contents = JSON.stringify(msgContents);
			} catch (e) {
				this.debugMsg(e);
				return;
			}
		}
	}

	/**
	 * @param message - The top-level chunkedOp message or a top-level op message
	 * with a chunkedOp inside its contents
	 */
	fixChunkedOp(message: any) {
		this.chunkProcessor.addMessage(message);
		if (!this.chunkProcessor.hasAllMessages()) {
			return;
		}

		const contents = this.chunkProcessor.getConcatenatedContents();
		this.fixOpContentsObject(contents);

		this.chunkProcessor.writeSanitizedContents(contents);
		this.chunkProcessor.reset();
	}

	sanitize(): ISequencedDocumentMessage[] {
		let seq = 0;

		try {
			this.messages.map((message) => {
				seq = message.sequenceNumber;
				// message types from protocol-definitions' protocol.ts
				switch (message.type) {
					case "join": {
						this.fixJoin(message);
						break;
					}
					case "propose": {
						this.fixPropose(message);
						break;
					}
					case "attach": {
						this.fixAttach(message);
						break;
					}
					case "op": {
						this.fixOp(message);
						break;
					}
					case "chunkedOp": {
						this.fixChunkedOp(message);
						break;
					}
					case "noop":
					case "leave":
					case "noClient":
					case "summarize":
					case "summaryAck":
					case "summaryNack":
						break;
					default:
						this.debugMsg(`Unexpected op type ${message.type}`);
				}
			});

			// make sure we don't miss an incomplete chunked op at the end
			assert(
				!this.chunkProcessor.isPendingProcessing(),
				0x08d /* "After sanitize, pending incomplete ops!" */,
			);
		} catch (error) {
			this.debugMsg(`Error while processing sequenceNumber ${seq}`);
			throw error;
		}

		return this.messages;
	}
}

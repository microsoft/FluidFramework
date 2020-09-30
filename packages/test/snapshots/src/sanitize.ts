/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This tool cleans up a message.json file downloaded through fluid-fetch to remove
 * user content and user identifying information.  Enough information can be retained
 * to allow loading through Fluid Preview, or everything can be scrubbed so that only
 * replay-tool can read the result.  Anonymous identifying information such as client
 * IDs are always retained.  Object keys are NOT scrubbed, including those that are
 * nested within values (only leaf values are scrubbed)
 *
 * Messages must match known structures when scrubbing for Fluid Preview.
 */

import fs from "fs";
import { strict as assert } from "assert";
import * as Validator from "jsonschema";
import { v4 as uuid } from "uuid";
import {
    ISequencedDocumentMessage,
} from "@fluidframework/protocol-definitions";
import {
    attachContentsSchema,
    joinContentsSchema,
    joinDataSchema,
    opContentsMapSchema,
    opContentsSchema,
    opContentsMergeTreeDeltaOpSchema,
    opContentsMergeTreeGroupOpSchema,
    opContentsRegisterCollectionSchema,
    proposeContentsSchema,
} from "./messageSchema";

function printUsage() {
    console.log("Usage:");
    console.log("   node sanitize [--full | --noBail] <input>");
    console.log("Where");
    console.log("  [--full] - scrub fully (result cannot be loaded in Fluid Preview)");
    console.log("  [--noBail] - don't bail out when encountering an unknown message format (it won't be scrubbed");
    console.log("  <input> - file path to message.json - file downloaded by FluidFetch tool");
    console.log("Note: <input> is sanitized in place");
    process.exit(-1);
}

enum TextType {
    Generic,
    Email,
    Name,
    FluidObject,
    MapKey
}

// Workaround to jsonschema package not supporting "false" as a schema
// that matches nothing
const falseResult = {
    valid: false,
    toString: () => { return "Unmatched format"; },
};

/**
 * Class that takes chunkedOp messages and can provide their concatenated
 * contents along with re-write sanitized content in-place back into the
 * messages.  Assumes sanitized messages are always less than or equal in
 * size to the original message.
 */
class ChunkedOpProcessor {
    private messages = new Array<any>();
    private writtenBack = false;

    addMessage(message: any): void {
        this.messages.push(message);
    }

    hasAllMessages(): boolean {
        // besides concating all the contents to see if they form a valid
        // json, only the last message has any indication of the total
        // number of chunks
        const lastMsgContents = this.messages[this.messages.length - 1].contents as string;
        assert(typeof lastMsgContents === "string");

        const lastChunkRegex = /"totalChunks":\d+}$/g;
        const matches = lastMsgContents.match(lastChunkRegex);
        console.log(matches);
        return matches.length === 1;
    }

    /**
     * @returns The concatenated contents of all the messages parsed as json
     */
    getConcatenatedContents(): any {
        const contentsString = this.messages.reduce((previousValue: string, currentValue: any) => {
            return previousValue + (currentValue.contents as string);
        }, "");

        try {
            return JSON.parse(contentsString);
        } catch (e) {
            console.error(e);
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
        try {
            // const stringified = JSON.stringify(contents);
            console.error(contents.totalChunks);
        } catch (e) {
            console.error(e);
        }

        this.writtenBack = true;
    }

    reset(): void {
        assert(this.writtenBack, "resetting ChunkedOpProcessor that never wrote back its contents");
        this.messages = new Array<any>();
        this.writtenBack = false;
    }

    isPendingProcessing(): boolean {
        return this.messages.length === 0;
    }
}

class Sanitizer {
    readonly validator = new Validator.Validator();
    readonly chunkProcessor = new ChunkedOpProcessor();
    // Represents the keys used to store fluid object identifiers
    readonly defaultExcludedKeys = new Set<string>();
    // Represents the keys used by merge-tree ops their "seg" property, where other
    // keys represent user information
    // readonly segExcludedKeys = new Set<string>();
    readonly replacementMap = new Map<string, string>();

    constructor(
        readonly messages: ISequencedDocumentMessage[],
        readonly fullScrub: boolean,
        readonly noBail: boolean,
    ) {
        this.defaultExcludedKeys.add("type");
        this.defaultExcludedKeys.add("id");
        this.defaultExcludedKeys.add("pkg");
        // this.segExcludedKeys.add("props");
    }

    /**
     * Validate that the provided message matches the provided schema.
     * For a full scrub, warn and continue (scrubber should fully sanitize unexpected
     * fields for ops), otherwise throw an error because we cannot be sure user
     * information is being sufficiently sanitized.
     */
    objectMatchesSchema(object: any, schema: any): boolean {
        const result =  schema === false ? falseResult : this.validator.validate(object, schema);
        if (!result.valid) {
            const errorMsg = `Bad msg fmt:\n${result.toString()}\n${JSON.stringify(object, undefined, 2)}`;

            if (this.fullScrub || this.noBail) {
                console.error(errorMsg);
            } else {
                throw new Error(errorMsg);
            }
        }
        return result.valid;
    }

    isFluidObjectKey(key: string): boolean {
        return key === "type" || key === "id";
    }

    /**
     * Replace text with garbage.  FluidObject types are not replaced when not under
     * full scrub mode.  Non-Generic type text is replaced consistently.
     */
    replaceText(input?: string, type: TextType = TextType.Generic): string {
        if (input === undefined) {
            return undefined;
        }

        if (type === TextType.Generic) {
            return "xxxxx";
        }

        if (this.replacementMap.has(input)) {
            return this.replacementMap.get(input);
        }

        let replacement;
        switch (type) {
            case TextType.Email:
                // email values have a trailing "}" that is preserved here
                replacement = `email_${uuid()}}`;
                break;
            case TextType.Name:
                replacement = `name_${uuid()}`;
                break;
            case TextType.FluidObject:
                if (this.fullScrub) {
                    replacement = `fluidobject_${uuid()}`;
                } else {
                    replacement = input;
                }
                break;
            default:
                return "xxxxx";
        }

        this.replacementMap.set(input, replacement);
        return replacement;
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
    replaceObject(input: object | null, excludedKeys: Set<string> = this.defaultExcludedKeys): object | null {
        // File might contain actual nulls
        // eslint-disable-next-line no-null/no-null
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
                    input[key] = this.replaceObject(value);
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
        // eslint-disable-next-line no-null/no-null
        if (input === null || input === undefined) {
            return input;
        }

        if (typeof input === "string") {
            return this.replaceText(input);
        } else if (Array.isArray(input)) {
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
            console.error(e);
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
                            pkg.fluid.browser.umd.files = this.replaceArray(pkg.fluid.browser.umd.files);
                        }
                    }
                } catch (e) {
                    console.error(e);
                }
            } else {
                if (this.fullScrub) {
                    message.contents.value = this.replaceText(message.contents.value, TextType.FluidObject);
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
                    console.error(e);
                }
            }
        });
    }

    /**
     * Fix the content of an attach in place
     * @param contents - contents object to fix
     */
    fixAttachContents(contents: any): any {
        assert(typeof contents === "object");
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
                console.error(e);
                return;
            }
        } else {
            this.fixAttachContents(message.contents);
        }
    }

    fixDeltaOp(deltaOp: any) {
        if (typeof deltaOp.seg === "string") {
            deltaOp.seg = this.replaceText(deltaOp.seg);
        } else {
            deltaOp.seg = this.replaceObject(deltaOp.seg);
        }
    }

    /**
     * Fix the contents object for an op message.  Does not do extra type handling.
     * @param contents - The contents object for an op message.  If it was a string in the
     * message, it must have been converted to an object first
     */
    fixOpContentsObject(contents: any) {
        // do replacement
        if (!this.objectMatchesSchema(contents, opContentsSchema)) {
            this.replaceAny(contents);
        } else {
            // handle container message types
            let contentsObj;
            if (contents.type === "attach") {
                // this one is like a regular attach op, except its contents aren't nested as deep
                // run fixAttach directly and return
                return this.fixAttach(contents);
            } else if (contents.type === "component") {
                // this one functionally nests its contents one layer deeper
                // bring up the contents object and continue as usual
                contentsObj = contents.contents;
            } else if (contents.type === "chunkedOp") {
                // this is a (regular?) op split into multiple parts due to size, e.g. because it
                // has an attached image. the contents of the chunks need to be concatenated to form
                // the complete stringified json object

                // TODO: handle this properly
                console.error("TODO: chunkedOp ops are skipped/unhandled");
                return;
            } else if (contents.type === "blobAttach") {
                // TODO: handle this properly once blob api is used
                console.error("TODO: blobAttach ops are skipped/unhandled");
                return;
            } else {
                contentsObj = contents;
            }

            if (this.fullScrub) {
                contentsObj.address = this.replaceText(contentsObj.address, TextType.FluidObject);
            }

            const innerContent = contentsObj.contents.content;
            assert(innerContent !== undefined);
            if (contentsObj.contents.type === "attach") {
                // attach op
                // handle case where inner content is stringified json
                if (typeof contentsObj.contents.content === "string") {
                    try {
                        const data = JSON.parse(contentsObj.contents.content);
                        this.fixAttachContents(data);
                        contentsObj.contents.content = JSON.stringify(data);
                    } catch (e) {
                        console.error(e);
                    }
                } else {
                    this.fixAttachContents(contentsObj.contents.content);
                }
            } else if (this.validator.validate(innerContent, opContentsMapSchema).valid) {
                // map op
                if (this.fullScrub) {
                    innerContent.address = this.replaceText(innerContent.address, TextType.FluidObject);
                    innerContent.contents.key = this.replaceText(innerContent.contents.key, TextType.MapKey);
                }
                if (innerContent.contents.value !== undefined) {
                    innerContent.contents.value.value = this.replaceAny(innerContent.contents.value.value);
                }
            } else if (this.validator.validate(innerContent, opContentsMergeTreeGroupOpSchema).valid) {
                // merge tree group op
                if (this.fullScrub) {
                    innerContent.address = this.replaceText(innerContent.address, TextType.FluidObject);
                }
                innerContent.contents.ops.forEach((deltaOp) => {
                    this.fixDeltaOp(deltaOp);
                });
            } else if (this.validator.validate(innerContent, opContentsMergeTreeDeltaOpSchema).valid) {
                // merge tree delta op
                if (this.fullScrub) {
                    innerContent.address = this.replaceText(innerContent.address, TextType.FluidObject);
                }
                this.fixDeltaOp(innerContent.contents);
            } else if (this.validator.validate(innerContent, opContentsRegisterCollectionSchema).valid) {
                // register collection op
                if (this.fullScrub) {
                    innerContent.address = this.replaceText(innerContent.address, TextType.FluidObject);
                    innerContent.contents.key = this.replaceText(innerContent.contents.key, TextType.MapKey);
                }
                if (innerContent.contents.value !== undefined) {
                    innerContent.contents.value.value = this.replaceAny(innerContent.contents.value.value);
                }
            } else {
                // message contents don't match any known op format
                this.objectMatchesSchema(contents, false);
            }
        }
    }

    fixOp(message: any) {
        // handle case where contents is stringified json
        if (typeof message.contents === "string") {
            let msgContents;
            try {
                msgContents = JSON.parse(message.contents);
            } catch (e) {
                console.error(e);
                return;
            }

            // don't do this in the try/catch so we don't
            // accidentally swallow a format error
            this.fixOpContentsObject(msgContents);

            try {
                message.contents = JSON.stringify(msgContents);
            } catch (e) {
                console.error(e);
                return;
            }
        } else {
            this.fixOpContentsObject(message.contents);
        }
    }

    fixChunkedOp(message: any) {
        this.chunkProcessor.addMessage(message);
        if (!this.chunkProcessor.hasAllMessages()) {
            return;
        }

        const contents = this.chunkProcessor.getConcatenatedContents();

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
                        console.log(`Unexpected op type ${message.type}`);
                }
            });

            // make sure we don't miss an incomplete chunked op at the end
            assert(!this.chunkProcessor.isPendingProcessing());
        } catch (error) {
            console.error(`Error while processing sequenceNumber ${seq}`);
            throw error;
        }

        return this.messages;
    }
}

function Sanitize(msgPath: string, fullScrub: boolean, noBail: boolean) {
    const input = fs.readFileSync(msgPath, { encoding: "utf-8" });
    const messages = JSON.parse(input) as ISequencedDocumentMessage[];

    const sanitizer = new Sanitizer(messages, fullScrub, noBail);
    const cleanMessages = sanitizer.sanitize();

    fs.writeFileSync(msgPath, JSON.stringify(cleanMessages, undefined, 2));

    console.log("Done.");
}

function main() {
    if (process.argv.length === 3) {
        return Sanitize(process.argv[2], false, false);
    }
    if (process.argv.length === 4) {
        if (process.argv[2] === "--full") {
            return Sanitize(process.argv[3], true, false);
        }
        if (process.argv[2] === "--noBail") {
            return Sanitize(process.argv[3], false, true);
        }
    }
    printUsage();
}

main();

// exceptions to not replace:
// _scheduler values from snapshots?

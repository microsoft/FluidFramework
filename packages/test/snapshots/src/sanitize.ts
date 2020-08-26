/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This tool cleans up a message.json file downloaded through fluid-fetch to remove
 * user content and user identifying information.  Anonymous identifying information
 * such as client IDs are retained, It works by explicit inclusion rather than
 * explicit exclusion for everything under contents.contents.content.contents.value
 * to attempt to be flexible with variable json structure.
 *
 * Object keys are NOT scrubbed, including those that are nested within values
 * (only leaf values are scrubbed)
 */

import fs from "fs";
import {
    ISequencedDocumentMessage,
} from "@fluidframework/protocol-definitions";

function printUsage() {
    console.log("Usage:");
    console.log("   Sanitize <input>");
    console.log("Where");
    console.log("  <input> - file path to message.json - file downloaded by FluidFetch tool");
    console.log("Note: <input> is sanitized in place");
    process.exit(-1);
}

enum TextType {
    Generic,
    Email,
    Name,
    FluidObject
}

function replaceText(input?: string, type: TextType = TextType.Generic): string {
    if (input === undefined) {
        return undefined;
    }
    switch (type) {
        case TextType.Email:
            // email values have a trailing "}" that is preserved here
            return "xxxxx@xxxxx.xxx}";
        case TextType.Name:
            return "Xxxxx Xxxxx";
        case TextType.FluidObject:
            return "@xx/xxxxx";
        case TextType.Generic:
        default:
            return "xxxxx";
    }
}

// "Forward declaration" of replaceObject to facilitate mutual recursion
let replaceObject = (input: object | null): object | null => {
    // eslint-disable-next-line no-null/no-null
    return null;
};

function replaceArray(input: any[]): any[] {
    for (let i = 0; i < input.length; i++) {
        const value = input[i];
        if (typeof value === "string") {
            input[i] = replaceText(value);
        } else if (Array.isArray(value)) {
            input[i] = replaceArray(value);
        } else if (typeof value === "object") {
            input[i] = replaceObject(value);
        }
    }
    return input;
}

/**
 * (sort of) recurses down the values of a JSON object to sanitize all its strings
 * (only checks strings, arrays, and objects)
 * @param input - The object to sanitize
 */
replaceObject = (input: object | null): object | null => {
    // File might contain actual nulls
    // eslint-disable-next-line no-null/no-null
    if (input === null) {
        // eslint-disable-next-line no-null/no-null
        return null;
    }

    const keys = Object.keys(input);
    keys.forEach((key) => {
        const value = input[key];
        if (typeof value === "string") {
            input[key] = replaceText(value);
        } else if (Array.isArray(value)) {
            input[key] = replaceArray(value);
        } else if (typeof value === "object") {
            input[key] = replaceObject(value);
        }
    });
    return input;
};

/**
 * Remove fluid object identifiers at the contents level.  These can also exist further
 * down in the case of "attach" messages, but that is handled with the "attach" logic.
 */
function fixFluidObjectNames(messageContents: any) {
    if (messageContents) {
        messageContents.id = replaceText(messageContents.id, TextType.FluidObject);
        messageContents.type = replaceText(messageContents.type, TextType.FluidObject);
    }
}

function fixSnapshotEntries(entries: any) {
    if (!Array.isArray(entries)) {
        console.error("Unexpected snapshot.entries value format");
        return;
    }

    entries.forEach((element) => {
        if (element.value?.contents) {
            try {
                let data = JSON.parse(element.value.contents);
                data = replaceObject(data);
                element.value.contents = JSON.stringify(data);
            } catch (e) {
                console.error(e);
            }
        }
    });
}

/**
 * Check the "contents" key for fixes
 * Primarily for "op" and "attach" messages
 */
function fixContents(messageContents: any) {
    fixFluidObjectNames(messageContents);

    if (messageContents?.snapshot?.entries) {
        fixSnapshotEntries(messageContents.snapshot.entries);
    }

    // "attach" message info can also be nested inside an "op"
    if (messageContents?.contents?.content?.snapshot?.entries) {
        fixSnapshotEntries(messageContents.contents.content.snapshot.entries);
    }

    const contents = messageContents?.contents?.content?.contents;
    if (contents === undefined) {
        return;
    }

    // Sequence op-specific fields
    if (contents.seg) {
        if (contents.seg.text) {
            contents.seg.text = replaceText(contents.seg.text);
        } else if (typeof contents.seg === "string") {
            contents.seg = replaceText(contents.seg);
        }
        if (typeof contents.props === "object") {
            contents.props = replaceObject(contents.props);
        }
    }

    // Map op-specific fields
    if (contents.type === "set" || contents.type === "delete") {
        contents.key = replaceText(contents.key);
    }

    // Everything else under contents.contents.content.contents
    if (contents.value) {
        replaceObject(contents.value);
    }

    if (contents.props) {
        contents.props = replaceObject(contents.props);
    }
}

function fixJoin(message: any) {
    const data = JSON.parse(message.data);

    const user = data.detail.user;
    user.id = replaceText(user.id, TextType.Email);
    user.email = replaceText(user.email, TextType.Email);
    user.name = replaceText(user.name, TextType.Name);

    message.data = JSON.stringify(data);
}

function fixPropose(message: any) {
    const key = message.contents?.key;
    if (key !== undefined && (key as string).startsWith("code")) {
        message.contents.value = replaceText(message.contents.value, TextType.FluidObject);
    }
}

function Sanitize(msgPath: string) {
    const input = fs.readFileSync(msgPath, { encoding: "utf-8" });
    const messages = JSON.parse(input) as ISequencedDocumentMessage[];

    let seq = 0;

    try {
        messages.map((message) => {
            seq = message.sequenceNumber;

            if (typeof message.contents === "object") {
                fixContents(message.contents);
            } else if (typeof message.contents === "string") {
                try {
                    const contents = JSON.parse(message.contents);
                    fixContents(contents);
                    message.contents = JSON.stringify(contents);
                } catch (e) {
                    // This is sometimes empty string, which will fail the json parse
                }
            }

            if (message.type === "join") {
                fixJoin(message);
            }

            if (message.type === "propose") {
                fixPropose(message);
            }
        });
    } catch (error) {
        console.error(`Error while processing seq # ${seq}`);
        throw error;
    }

    fs.writeFileSync(msgPath, JSON.stringify(messages, undefined, 2));

    console.log("Done.");
}

function main() {
    Sanitize(process.argv[2]);
}

if (process.argv.length !== 3) {
    printUsage();
}

main();

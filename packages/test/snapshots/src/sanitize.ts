/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import {
    ISequencedDocumentMessage,
} from "@microsoft/fluid-protocol-definitions";

function printUsage() {
    console.log("Usage:");
    console.log("   Sanitize <input>");
    console.log("Where");
    console.log("  <input> - file path to message.json - file downloaded by FluidFetch tool");
    process.exit(-1);
}

function replaceTextCore(len: number): string {
    let str = "";
    while (str.length < len) {
        str = str + Math.random().toString(36).substring(2);
    }
    return str.substr(0, len);
}

function replaceText(input?: string): string {
    if (input === undefined) {
        return undefined;
    }
    return replaceTextCore(input.length);
}

function replaceEmail(input?: string): string {
    if (input === undefined) {
        return undefined;
    }
    return `${replaceTextCore(9)}@example.com}`;
}

function replaceName(input?: string): string {
    if (input === undefined) {
        return undefined;
    }
    return replaceTextCore(15);
}

function fixContents(messageContents: any) {
    if (!messageContents ||
        !messageContents.contents ||
        !messageContents.contents.content ||
        !messageContents.contents.content.contents) {
        return;
    }

    const contents = messageContents.contents.content.contents;
    if (contents.seg) {
        if (contents.seg.text) {
            contents.seg.text = replaceText(contents.seg.text);
        } else if (typeof contents.seg === "string") {
            contents.seg = replaceText(contents.seg);
        }
    }

    if (contents.value) {
        const value = contents.value;
        value.userPrincipalName = replaceEmail(value.userPrincipalName);
        value.displayName = replaceName(value.displayName);
        value.originalName = replaceName(value.originalName);
        if (contents.value.value && typeof contents.value.value === "object") {
            const value2 = contents.value.value;
            value2.userPrincipalName = replaceEmail(value2.userPrincipalName);
            value2.displayName = replaceName(value2.displayName);
            value2.originalName = replaceName(value2.originalName);
        }
    }
}

function DoStuff() {
    const input = fs.readFileSync(process.argv[2], { encoding: "utf-8" });
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
                }
            }

            if (message.type === "join") {
                const obj = message as any;
                const data = JSON.parse(obj.data);

                const user = data.detail.user;
                user.id = replaceEmail(user.id);
                user.email = replaceEmail(user.email);
                user.name = replaceName(user.name);

                obj.data = JSON.stringify(data);
            }
        });
    } catch (error) {
        console.error(`Error while processing seq # ${seq}`);
        throw error;
    }

    fs.writeFileSync(process.argv[2], JSON.stringify(messages, undefined, 2));

    console.log("Done.");
}

if (process.argv.length !== 3) {
    printUsage();
}

DoStuff();

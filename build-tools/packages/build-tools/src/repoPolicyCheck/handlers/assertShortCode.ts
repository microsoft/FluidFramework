/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    Node,
    NumericLiteral,
    Project,
    SourceFile,
    StringLiteralLike,
    SyntaxKind,
} from "ts-morph";
import fs from "fs";
import path from "path";
import { Handler } from "../common";

const shortCodes = new Map<number, Node>();
const newAssetFiles = new Set<SourceFile>();
const codeToMsgMap = new Map<string, string>();
let maxShortCode = -1;

function getCallsiteString(msg: Node) {
    return `${msg.getSourceFile().getFilePath()}@${msg.getStartLineNumber()}`
}

/**
 * Given a source file this function will look for all assert functions contained in it, and return the second parameter from
 * all the functions which is the message parameter
 * @param sourceFile - The file to get the assert message parameters for.
 * @returns - an array of all the assert message parameters
 */
function getAssertMessageParams(sourceFile: SourceFile): (StringLiteralLike | NumericLiteral)[] {
    const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
    const messageArgs: (StringLiteralLike | NumericLiteral)[] = []
    for (const call of calls) {
        if (call.getExpression().getText() === "assert") {
            const args = call.getArguments();
            if (args.length >= 1 && args[1] !== undefined) {
                const kind = args[1].getKind();
                switch (kind) {
                    case SyntaxKind.StringLiteral:
                    case SyntaxKind.NumericLiteral:
                    case SyntaxKind.NoSubstitutionTemplateLiteral:
                        messageArgs.push(args[1] as any);
                        break;
                    case SyntaxKind.TemplateExpression:
                        throw new Error(`Template expressions are not supported in assertions (they'll be replaced by a short code anyway). ` +
                            `Use a string literal instead.\n${getCallsiteString(args[1])}`);
                    case SyntaxKind.BinaryExpression:
                    case SyntaxKind.CallExpression:
                        break;
                    default:
                        throw new Error(`Unsupported argument kind: ${kind}\n${getCallsiteString(args[1])}`);
                }
            }
        }
    }
    return messageArgs;
}

export const handler: Handler = {
    name: "assert-short-codes",
    match: /^(packages|(common\/lib\/common-utils)|(server\/routerlicious\/packages\/protocol-base)).*\/tsconfig\.json/i,
    handler: (tsconfigPath) => {
        if (tsconfigPath.includes("test")) {
            return;
        }
        // load the project based on the tsconfig
        const project = new Project({
            skipFileDependencyResolution: true,
            tsConfigFilePath: tsconfigPath,
        });
        // walk all the files in the project
        for (const sourceFile of project.getSourceFiles()) {
            // walk the assert message params in the file
            for (const msg of getAssertMessageParams(sourceFile)) {
                const nodeKind = msg.getKind();
                switch (nodeKind) {
                    // If it's a number, validate it's a shortcode
                    case SyntaxKind.NumericLiteral: {
                        const numLit = msg as NumericLiteral;
                        if (!numLit.getText().startsWith("0x")) {
                            return `Shortcodes must be provided by automation and be in hex format: ${numLit.getText()}\n\t${getCallsiteString(numLit)}`;
                        }
                        const numLitValue = numLit.getLiteralValue();
                        if (shortCodes.has(numLitValue)) {
                            // if we find two usages of the same short code then fail
                            return `Duplicate shortcode 0x${numLitValue.toString(16)} detected\n\t${getCallsiteString(shortCodes.get(numLitValue)!)}\n\t${getCallsiteString(numLit)}`;
                        }
                        shortCodes.set(numLitValue, numLit);
                        //calculate the maximun short code to ensure we don't duplicate
                        maxShortCode = Math.max(numLitValue, maxShortCode);

                        // If comment already exists, extract it for the mapping file
                        const comments = msg.getTrailingCommentRanges();
                        if (comments.length > 0) {
                            let originalErrorText = comments[0].getText().replace(/\/\*/g, '').replace(/\*\//g, '').trim();
                            if (originalErrorText.startsWith("\"") || originalErrorText.startsWith("`")) {
                                originalErrorText = originalErrorText.substring(1, originalErrorText.length - 1)
                            }
                            codeToMsgMap.set(numLit.getText(), originalErrorText);
                        }
                        break;
                    }
                    // If it's a simple string literal, track the file for replacements later
                    case SyntaxKind.StringLiteral:
                    case SyntaxKind.NoSubstitutionTemplateLiteral:
                        newAssetFiles.add(sourceFile);
                        break;
                    // Anything else isn't supported
                    default:
                        return `Unexpected node kind '${nodeKind}'. Assert messages to be processed can only be numbers (auto-generated by the policy-check tool) or string literals.\n\t${getCallsiteString(msg)}`;
                }
            }
        }
    },
    final: (root, resolve) => {
        const errors: string[] = [];

        function isNumericLiteral(msg: StringLiteralLike | NumericLiteral): msg is NumericLiteral {
            return msg.getKind() === SyntaxKind.NumericLiteral;
        }

        // go through all the newly collected asserts and add short codes
        for (const s of newAssetFiles) {
            // another policy may have changed the file, so reload it
            s.refreshFromFileSystemSync();
            for (const msg of getAssertMessageParams(s)) {
                // here we only want to looks at those messages that are not numbers,
                // as we validated existing short codes above
                if (!isNumericLiteral(msg)) {
                    // resolve === fix
                    if (resolve) {
                        //for now we don't care about filling gaps, but possible
                        const shortCode = ++maxShortCode;
                        shortCodes.set(shortCode, msg);
                        const text = msg.getLiteralText();
                        const shortCodeStr = `0x${shortCode.toString(16).padStart(3, "0")}`;
                        // replace the message with shortcode, and put the message in a comment
                        msg.replaceWithText(`${shortCodeStr} /* ${text} */`);
                        codeToMsgMap.set(shortCodeStr, text);
                    } else {
                        // TODO: if we are not in resolve mode we
                        // allow  messages that are not short code. this seems like the right
                        // behavior for main. we may want to enforce shortcodes in release branches in the future
                        // errors.push(`no assert shortcode: ${getCallsiteString(msg)}`);
                        break;
                    }
                }
            }
            if (resolve) {
                s.saveSync();
            }
        }
        const result = errors.length > 0 ? { error: errors.join("\n") } : undefined;
        if (resolve) {
            writeShortCodeMappingFile();
        }
        return result;
    }
};

function writeShortCodeMappingFile() {
    const mapContents = Array.from(codeToMsgMap.entries()).sort().reduce((accum, current) => { accum[current[0]] = current[1]; return accum; }, {} as any);
    const targetFolder = "packages/runtime/test-runtime-utils/src";

    if (!fs.existsSync(targetFolder)) {
        fs.mkdirSync(targetFolder, { recursive: true });
    }

    const fileContents =
        `/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 *
 * THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY
 */

// Auto-generated by policy-check in @fluidframework/build-tools.

export const shortCodeMap = ${JSON.stringify(mapContents, null, 4)};
`;
    fs.writeFileSync(path.join(targetFolder, "assertionShortCodesMap.ts"), fileContents, { encoding: "utf8" });
}


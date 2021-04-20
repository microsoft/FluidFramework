/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    Node,
    NumericLiteral,
    Project,
    SourceFile,
    StringLiteral,
    SyntaxKind,
    TemplateLiteral,
} from "ts-morph";
import {Handler} from "../common";

const shortCodes = new Map<number, Node>();
const newAssetFiles = new Set<SourceFile>();
let maxShortCode = -1;

function getCallsiteString(msg: Node){
    return `${msg.getSourceFile().getFilePath()}@${msg.getStartLineNumber()}`
}

/**
 * Given a source file this function will look for all assert functions contained in it, and return the second parameter from
 * all the functions which is the message parameter
 * @param sourceFile - The file to get the assert message parameters for.
 * @returns - an array of all the assert message parameters
 */
function getAssertMessageParams(sourceFile: SourceFile): (StringLiteral | NumericLiteral | TemplateLiteral)[]{
    const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
    const messageArgs:(StringLiteral | NumericLiteral | TemplateLiteral)[] = []
    for(const call of calls){
        if(call.getExpression().getText() === "assert"){
            const args = call.getArguments();
            if(args.length >=1 && args[1] !== undefined){
                const kind = args[1].getKind();
                switch(kind){
                    case SyntaxKind.StringLiteral:
                    case SyntaxKind.NumericLiteral:
                    case SyntaxKind.TemplateExpression:
                    case SyntaxKind.NoSubstitutionTemplateLiteral:
                        messageArgs.push(args[1] as any)
                        break;
                    case SyntaxKind.BinaryExpression:
                    case SyntaxKind.CallExpression:
                        break;
                    default:
                        throw new Error(`Unknown argument kind: ${kind}\n${getCallsiteString(args[1])}`);
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
        if(tsconfigPath.includes("test")){
            return;
        }
        // load the project based on the tsconfig
        const project = new Project({
            skipFileDependencyResolution: true,
            tsConfigFilePath: tsconfigPath,
        });
        // walk all the files in the project
        for(const sourceFile of project.getSourceFiles()){
            // walk the assert message params in the file
            for(const msg of getAssertMessageParams(sourceFile)){
                // if it's a number, then it should be shortcode, which we validate
                if(msg.getKind() === SyntaxKind.NumericLiteral){
                    const numLit = msg as NumericLiteral;
                    if(!numLit.getText().startsWith("0x")){
                        return `Shortcodes must be provided by automation and be in hex format: ${numLit.getText()}\n\t${getCallsiteString(numLit)}`;
                    }
                    const numLitValue = numLit.getLiteralValue();
                    if(shortCodes.has(numLitValue)){
                        // if we find two usages of the same short code then fail
                        return `Duplicate shortcode 0x${numLitValue.toString(16)} detected\n\t${getCallsiteString(shortCodes.get(numLitValue)!)}\n\t${getCallsiteString(numLit)}`;
                    }
                    shortCodes.set(numLitValue, numLit);
                    //calculate the maximun short code to ensure we don't duplicate
                    maxShortCode = Math.max(numLitValue, maxShortCode);
                }else{
                    // the message is not a number, so stash it to apply short codes later
                    newAssetFiles.add(sourceFile);
                }
            }
        };
    },
    final: (root, resolve) => {
        const errors: string[]=[];
        // go through all the newly collected asserts and add short codes
        for(const s of newAssetFiles){
            // another policy may have changed the file, so reload it
            s.refreshFromFileSystemSync();
            for(const msg of getAssertMessageParams(s)){
                // here we only want to looks at those messages that are not numbers,
                // as we validated existing short codes above
                if(msg.getKind() !== SyntaxKind.NumericLiteral){
                    // resolve === fix
                    if(resolve){
                        //for now we don't care about filling gaps, but possible
                        const shortCode = ++maxShortCode;
                        shortCodes.set(shortCode, msg);
                        const text = msg.getText();
                        const shortCodeStr = `0x${shortCode.toString(16).padStart(3,"0")}`;
                        // replace the message with shortcode, and put the message in a comment
                        msg.replaceWithText(`${shortCodeStr} /* ${text} */`);
                    }else{
                        // TODO: if we are not in resolve mode we
                        // allow  messages that are not short code. this seems like the right
                        // behavior for main. we may want to enforce shortcodes in release branches in the future
                        // errors.push(`no assert shortcode: ${getCallsiteString(msg)}`);
                        break;
                    }
                }
            }
            if(resolve){
                s.saveSync();
            }
        }
        const result =  errors.length > 0 ? {error: errors.join("\n")} : undefined;
        return result;
    }
};

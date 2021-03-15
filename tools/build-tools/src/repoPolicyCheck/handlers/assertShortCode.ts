/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Node, NumericLiteral, Project, SourceFile, SyntaxKind, } from "ts-morph";
import {Handler} from "../common";

const shortCodes = new Map<number, Node>();
const newAssetFiles = new Set<SourceFile>();
let maxShortCode = -1;

function getCallsiteString(msg: Node){
    return `${msg.getSourceFile().getFilePath()}@${msg.getStartLineNumber()}`
}

function *getAssertMessageParams(sourceFile: SourceFile){
    const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
    for(const call of calls){
        if(call.getExpression().getText() === "assert"){
            const args = call.getArguments();
            if(args.length >=1 && args[1] !== undefined){
                yield args[1];
            }
        }
    }
}

export const handler: Handler = {
    name: "assert-short-codes",
    match: /^(packages)\/.*(?!test)\/tsconfig\.json/i,
    handler: (tsconfigPath) => {
        const project = new Project({
            skipFileDependencyResolution: true,
            tsConfigFilePath: tsconfigPath,
        });
        for(const sourceFile of project.getSourceFiles()){
            for(const msg of getAssertMessageParams(sourceFile)){
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
                    newAssetFiles.add(sourceFile);
                }
            }
        };
    },
    final: (root, resolve) => {
        const errors: string[]=[];
        // go through all the newly collected asserts and add short codes
        for(const s of newAssetFiles){
            const res = s.refreshFromFileSystemSync();
            for(const msg of getAssertMessageParams(s)){
                if(resolve){
                    //for now we don't care about filling gaps, but possible
                    const shortCode = ++maxShortCode;
                    shortCodes.set(shortCode, msg);
                    const text = msg.getText();
                    const shortCodeStr = `0x${shortCode.toString(16).padStart(3,"0")}`;
                    msg.replaceWithText(`${shortCodeStr} /* ${text} */`);
                }else{
                    errors.push(`no assert shortcode: ${getCallsiteString(msg)}`);
                    break;
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

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Node, Project } from "ts-morph";
import * as fs from "fs";
import { getPackageDetails, PackageVersion } from "./packageJson";

export interface TypeData{
    readonly name: string;
    readonly kind: string,
    readonly isDeprecated: boolean;
    readonly isPrivate: boolean;
}

function hasTag(node: Node, tagName: "deprecated" | "private"){
    if(Node.isJSDocableNode(node)) {
        for(const doc of node.getJsDocs()){
            for(const tag of doc.getTags()){
                if(tag.getTagName() === tagName){
                    return true;
                }
            }
        }
    }
    return false;
}

function getNodeTypeData(node:Node, namespacePrefix?:string): TypeData[]{

    if (Node.isNamespaceDeclaration(node)){
        const typeData: TypeData[]=[];
        for(const s of node.getStatements()){
            typeData.push(...getNodeTypeData(s, node.getName()));
        }
        return typeData;
    }


    if(Node.isVariableStatement(node)){
        const typeData: TypeData[]=[];
        for(const dec of node.getDeclarations()){
            typeData.push(...getNodeTypeData(dec, namespacePrefix));
        }
        return typeData
    }

    const isDeprecated =hasTag(node, "deprecated");
    const isPrivate =hasTag(node, "private");
    const kind = node.getKindName();
    if(Node.isClassDeclaration(node)
    || Node.isEnumDeclaration(node)
    || Node.isInterfaceDeclaration(node)
    || Node.isFunctionDeclaration(node)
    || Node.isTypeAliasDeclaration(node)
    || Node.isVariableDeclaration(node)){

        const name = namespacePrefix !== undefined ? `${namespacePrefix}.${node.getName()}` : node.getName()!;

        return [{
            name,
            kind,
            isDeprecated,
            isPrivate,
        }];
    }


    throw new Error(`Unknown Export Kind: ${node.getKindName()}`)
}


function generateTypeDataForProject(packageDir: string): TypeData[] {

    const tsconfigPath = `${packageDir}/tsconfig.json`;
    if(!fs.existsSync(tsconfigPath)){
        throw new Error(`Tsconfig json does not exist: ${tsconfigPath}`)
    }

    const project = new Project({
        skipFileDependencyResolution: true,
        tsConfigFilePath: tsconfigPath,
    });

    const file = project.getSourceFile("index.ts")
    if(file == undefined){
        throw new Error("index.ts does not exist in package source");
    }
    const typeData: TypeData[]=[];

    const exportedDeclarations = file.getExportedDeclarations();
    for(const declaration of exportedDeclarations){
        for(const dec of declaration[1]){
            typeData.push(...getNodeTypeData(dec));
        }
    }
    return typeData;
}

export interface VersionedTypeData{
    readonly pkg: PackageVersion;
    readonly typeData: Record<string, TypeData[]>;
}

export function refreshVersionedTypeData(packageDir:string): VersionedTypeData {

    let typeData: Record<string, TypeData[]> = {};

    const typeDataPath = `${packageDir}/typeData.json`;
    if(fs.existsSync(typeDataPath)){
        const rawVersionedTypeData = fs.readFileSync(typeDataPath);
        typeData = JSON.parse(rawVersionedTypeData.toString());
    }

    const currentTypeData = generateTypeDataForProject(packageDir);

    const pkg = getPackageDetails(packageDir);

    typeData[pkg.noPatchString] = currentTypeData;
    fs.writeFileSync(typeDataPath, JSON.stringify(typeData,undefined,2));

    return {
        pkg,
        typeData,
    };
}

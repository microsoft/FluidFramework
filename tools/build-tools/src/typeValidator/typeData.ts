/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Node, Project, ts } from "ts-morph";
import * as fs from "fs";
import { getPackageDetails, PackageDetails } from "./packageJson";

export interface PackageAndTypeData{
    packageDetails: PackageDetails;
    typeData: TypeData[];
    project: Project;
}

export interface TypeData {
    readonly name: string;
    readonly kind: string;
    readonly node: Node;
}

export function getFullTypeName(typeData: TypeData){
    return `${typeData.kind}_${typeData.name}`
}

export function hasDocTag(data: TypeData, tagName: "deprecated" | "internal"){
    if(Node.isJSDocableNode(data.node)) {
        for(const doc of data.node.getJsDocs()){
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

    /*
        handles namespaces e.g.
        export namespace foo{
            export type first: "first";
            export type second: "second";
        }
        this will prefix foo and generate two type data:
        foo.first and foo.second
    */
    if (Node.isNamespaceDeclaration(node)){
        const typeData: TypeData[]=[];
        for(const s of node.getStatements()){
            // only get type data for nodes that are exported from the namespace
            if(Node.isExportableNode(s) && s.isExported()){
                typeData.push(...getNodeTypeData(s, node.getName()));
            }
        }
        return typeData;
    }

    /*
        handles variable statements: const foo:number=0, bar:number = 0;
        this just grabs the declarations: foo:number=0 and bar:number
        which we can make type data from
    */
    if(Node.isVariableStatement(node)){
        const typeData: TypeData[]=[];
        for(const dec of node.getDeclarations()){
            typeData.push(...getNodeTypeData(dec, namespacePrefix));
        }
        return typeData
    }

    if(Node.isIdentifier(node)){
        const typeData: TypeData[]=[];
        node.getDefinitionNodes().forEach(
            (d)=>typeData.push(...getNodeTypeData(d, namespacePrefix)));
        return typeData;
    }

    if (Node.isClassDeclaration(node)
        || Node.isEnumDeclaration(node)
        || Node.isInterfaceDeclaration(node)
        || Node.isTypeAliasDeclaration(node)
        || Node.isVariableDeclaration(node)
        || Node.isFunctionDeclaration(node)
    ) {
        const name = namespacePrefix !== undefined
            ? `${namespacePrefix}.${node.getName()}`
            : node.getName()!;

        const typeData: TypeData[] = [{
            name,
            kind: node.getKindName(),
            node,
        }];
        return typeData;
    }

    throw new Error(`Unknown Export Kind: ${node.getKindName()}`)
}

export function toTypeString(prefix: string, typeData: TypeData){
    const node = typeData.node;
    let typeParams: string | undefined;
    if(Node.isInterfaceDeclaration(node)
        || Node.isTypeAliasDeclaration(node)
        || Node.isClassDeclaration(node)
    ){
        // does the type take generics that don't have defaults?
        if(node.getTypeParameters().length > 0
            && node.getTypeParameters().some((tp)=>tp.getDefault() === undefined)
        ){
            // it's really hard to build the right type for a generic,
            // so for now we'll just pass any, as it will always work
            typeParams = `<${node.getTypeParameters().map(()=>"any").join(",")}>`;
        }
    }

    const typeStringBase =`${prefix}.${typeData.name}${typeParams ?? ""}`;
    switch(node.getKind()){
        case ts.SyntaxKind.VariableDeclaration:
        case ts.SyntaxKind.FunctionDeclaration:
        case ts.SyntaxKind.Identifier:
            // turn variables and functions into types
            return `TypeOnly<typeof ${typeStringBase}>`;

        default:
            return `TypeOnly<${typeStringBase}>`;
    }
}

function tryFindDependencyPath(packageDir: string, dependencyName: string) {
    // for lerna mono-repos we may need to look for the hoisted packages
    //
    let testPath = packageDir;
    while(!fs.existsSync(`${testPath}/node_modules/${dependencyName}/package.json`)
        && !fs.existsSync(`${testPath}/lerna.json`
    )){
        testPath += "/.."
    }
    return `${testPath}/node_modules/${dependencyName}`
}

function getIndexSourceFile(basePath: string){

    const tsConfigPath: string =`${basePath}/tsconfig.json`;

    if (fs.existsSync(tsConfigPath)) {
        const project = new Project({
            skipFileDependencyResolution: true,
            tsConfigFilePath: tsConfigPath,
        });

        return {project, file: project.getSourceFileOrThrow("index.ts")};

    }else{
        const project = new Project({
            skipFileDependencyResolution: true,
        });
        project.addSourceFilesAtPaths(`${basePath}/dist/**/*.d.ts`)
        return {project, file: project.getSourceFileOrThrow("index.d.ts")};
    }

}

export async function generateTypeDataForProject(packageDir: string, dependencyName: string | undefined): Promise<PackageAndTypeData> {

    let basePath = dependencyName === undefined
        ? packageDir
        : tryFindDependencyPath(packageDir, dependencyName);

    if (!fs.existsSync(`${basePath}/package.json`)) {
        throw new Error(`package.json does not exist at ${basePath}.\nYou may need to install the package via npm install.`)
    }
    const {project, file} = getIndexSourceFile(basePath);
    const typeData = new Map<string, TypeData>();
    const exportedDeclarations = file.getExportedDeclarations();
    for(const declarations of exportedDeclarations.values()){
        for(const dec of declarations){
           getNodeTypeData(dec).forEach((td)=> {
               const fullName = getFullTypeName(td);
               typeData.set(fullName, td);
           })
        }
    }

    const packageDetails = await getPackageDetails(basePath);
    return {
        packageDetails,
        typeData: Array.from(typeData.values()).sort((a,b)=>a.name.localeCompare(b.name)),
        project,
    };
}

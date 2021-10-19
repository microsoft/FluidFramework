/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ClassDeclaration, Node, Project, Scope, SymbolFlags, ts, Type, TypeChecker } from "ts-morph";
import * as fs from "fs";
import * as path from "path";
import { getPackageDetails, PackageDetails } from "./packageJson";
import { type } from "os";

export interface PackageAndTypeData{
    packageDetails: PackageDetails;
    typeData: TypeData[];
}

export interface TypeData {
    readonly name: string;
    readonly kind: string;
    readonly node: Node;
    readonly classData?: ClassData;
}

export interface ClassData {
    readonly typeParameters: string[];
    readonly properties: string[];
    readonly replacedTypes: Set<string>;
    readonly requiredGenerics: Set<string>;
}

export interface TestCaseTypeData extends TypeData {
    prefix: "old" | "current";
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

interface DecompositionResult {
    /**
     * The decomposed type with external types replaced with strings
     */
    typeAsString: string,
    /**
     * External types that have been replaced
     */
    replacedTypes: Set<string>,
    /**
     * Generic classes that are required for the class because
     * they can't be replaced without disrupting type structure
     */
    requiredGenerics: Set<string>,
}

function mergeIntoSet<T>(into: Set<T>, from: Set<T>) {
    from.forEach((v) => into.add(v));
}

function mergeResults(
    into: Partial<DecompositionResult>,
    from: DecompositionResult,
    separator: string,
) {
    if (into.typeAsString === undefined) {
        into.typeAsString = from.typeAsString;
        into.replacedTypes = from.replacedTypes;
        into.requiredGenerics = from.requiredGenerics;
    } else {
        into.typeAsString = `${into.typeAsString}${separator}${from.typeAsString}`;
        from.replacedTypes.forEach((v) => into.replacedTypes!.add(v));
        from.requiredGenerics.forEach((v) => into.requiredGenerics!.add(v));
    }
}

/**
 * ts-morph doesn't expose this fn on TypeChecker and it gets verbose to
 * use inline
 * @param typeChecker
 * @param type
 * @returns
 */
function typeToString(typeChecker: TypeChecker, type: Type): string {
    return typeChecker.compilerObject.typeToString(type.compilerType);
}

/**
 * Break down a complex type to extract its constituents to check separately,
 * then reconstruct it with type -> string replacement
 * e.g. Promise<UncomparableClass | OtherClass> -> Promise<"UncomparableClass" | "OtherClass">
 * The goal is to preserve the structure of the type while removing dependencies on
 * external types
 * @param checker - A TypeChecker object to help with getting type names
 * @param node - The type node to decompose
 * @param preservedSymbols - Symbols not to convert to strings during decomposition (e.g. generics)
 * @returns
 */
function decomposeType(
    checker: TypeChecker,
    node: Type,
): DecompositionResult {
    const result = {
        typeAsString: typeToString(checker, node),
        replacedTypes: new Set<string>(),
        requiredGenerics: new Set<string>(),
    };
    // console.log(`type as string: ${result.typeAsString}`)


    // don't try to decompose literals because they don't need to be converted to strings
    // booleans because they are a union of false | true but not aliased
    // (the enum/boolean checks don't actually catch when they're unioned with another
    // type but it also doesn't really matter for type checking...)
    if (node.isLiteral() || node.isBoolean()) {
        return result;
    }
    // don't try to decompose aliases because they are handled at their declaration
    // enums because they are unions that don't need to be decomposed
    // these still need to be converted to strings because they are defined symbols
    if (node.getAliasSymbol() || node.isEnum()) {
        result.typeAsString = `"${result.typeAsString}""`;
    }

    // type parameters can't be string literals and should not be replaced
    if (node.isTypeParameter()) {
        // console.log(`type param: ${typeToString(checker, node)}`);
        return result;
    }

    node = node as Type;

    // intersections bind more strongly than unions so split those second
    if (node.isUnion()) {
        return decomposeTypes(checker, node.getUnionTypes(), " | ");
    } else if (node.isIntersection()) {
        return decomposeTypes(checker, node.getIntersectionTypes(), " & ");
    } else {
        // TODO: handle extends/constraints, conditional types, inline objects, index types, tuple, defaults, splat, rest
        // node.getTypeArguments().map((t) => console.log(`type arg: ${typeToString(checker, t)}`));

        // handle type args/generics
        if (node.getTypeArguments().length > 0) {
            // Array shorthand (type[]) is handled by type arguments
            // TODO: handle multiple type args in result output
            const typeArgsResult = decomposeTypes(checker, node.getTypeArguments(), ", ");
            const symbolName = checker.compilerObject.symbolToString(node.compilerType.getSymbol()!);
            typeArgsResult.requiredGenerics.add(symbolName);
            typeArgsResult.typeAsString = `${symbolName}<${typeArgsResult.typeAsString}>`;
            return typeArgsResult;
        } else {
            result.typeAsString = `"${result.typeAsString}"`;
            return result;
        }

    }
}

function decomposeTypes(
    checker: TypeChecker,
    nodes: Type[],
    separator: string,
): DecompositionResult {
    const result = {} as DecompositionResult;
        nodes.map((t) => {
            const subResult = decomposeType(checker, t);
            mergeResults(result, subResult, separator);
        });
    return result;
}

/**
 * Create a stripped down version of a class declaration
 *
 * TODO: nested types e.g. Promise<{a: ICustomInterface, b: CustomClass}>
 * TODO: conditionals, extensions on generics
 * @param node
 * @returns
 */
function stripClassDeclaration(typeChecker: TypeChecker, node: ClassDeclaration): ClassData {
    const replacedTypes = new Set<string>();
    const replacedProperties: string[] = [];
    const requiredGenerics = new Set<string>();
    const typeParameters: string[] = [];

    node.getTypeParameters().forEach((tp) => {
        typeParameters.push(typeToString(typeChecker, tp.getType()));
    })

    // Convert extensions and implementations to properties for comparison because they
    // can't be replaced as string literal types
    // TODO: generics/type args on extends/implements
    node.getExtends()?.getTypeArguments().forEach((tn) => {
        const result = decomposeType(typeChecker, tn.getType());
        mergeIntoSet(replacedTypes, result.replacedTypes);
        mergeIntoSet(requiredGenerics, result.requiredGenerics);
        const typeName = typeToString(typeChecker, tn.getType()).replace(/[^\w]/g, "_");
        replacedProperties.push(`__extends__${typeName}: ${result.typeAsString};`);
    });
    node.getImplements().forEach((ex) => {
        const result = decomposeType(typeChecker, ex.getType());
        mergeIntoSet(replacedTypes, result.replacedTypes);
        mergeIntoSet(requiredGenerics, result.requiredGenerics);
        const typeName = typeToString(typeChecker, ex.getType()).replace(/[^\w]/g, "_");
        replacedProperties.push(`__implements__${typeName}: ${result.typeAsString};`);
    });

    for (const member of node.getMembers()) {
        if (Node.isModifierableNode(member)) {
            // Pass over Private properties because they don't affect the public API
            const modifierList = member.getModifiers().map((val) => val.getText());
            if (modifierList.indexOf(Scope.Private) != -1) {
                continue;
            }

            // TODO: handle statics, protected methods
            // decorators, asterisk tokens

            const modifiers = modifierList.join(" ");
            if (Node.isMethodDeclaration(member)) {
                // Handle type params/generics
                let typeArgsString = "";
                if (member.getTypeParameters().length > 0) {
                    const typeArgsResult = decomposeTypes(
                        typeChecker,
                        member.getTypeParameters().map((tp) => tp.getType()),
                        ", ",
                    );
                    mergeIntoSet(replacedTypes, typeArgsResult.replacedTypes);
                    mergeIntoSet(requiredGenerics, typeArgsResult.requiredGenerics);
                    typeArgsString = `<${typeArgsResult.typeAsString}>`;
                }

                // Handle parameters
                let paramsString = "";
                if (member.getParameters().length > 0) {
                    paramsString = member.getParameters().map((p) => {
                        const subResult = decomposeType(typeChecker, p.getType());
                        mergeIntoSet(replacedTypes, subResult.replacedTypes);
                        mergeIntoSet(requiredGenerics, subResult.requiredGenerics);
                        return `${p.getName()}: ${subResult.typeAsString}`;
                    }).join(", ");
                }

                // Handle return type
                const returnResult = decomposeType(typeChecker, member.getReturnType());
                mergeIntoSet(replacedTypes, returnResult.replacedTypes);
                mergeIntoSet(requiredGenerics, returnResult.requiredGenerics);

                // Other stuff
                const qToken = member.hasQuestionToken() ? "?" : "";

                const method = `${modifiers} ${member.getName()}${qToken}${typeArgsString}(${paramsString}): ${returnResult.typeAsString};`;

                replacedProperties.push(method);
            } else if (Node.isPropertyDeclaration(member)) {
                const result = decomposeType(typeChecker, member.getType());
                mergeIntoSet(replacedTypes, result.replacedTypes);
                mergeIntoSet(requiredGenerics, result.requiredGenerics);
                const qToken = member.hasQuestionToken() ? "?" : "";
                const property = `${modifiers} ${member.getName()}${qToken}: ${result.typeAsString};`;

                replacedProperties.push(property);
            } else if (Node.isGetAccessorDeclaration(member)) {
                // return type should always exist for a getter
                const result = decomposeType(typeChecker, member.getReturnType());
                mergeIntoSet(replacedTypes, result.replacedTypes);
                mergeIntoSet(requiredGenerics, result.requiredGenerics);
                const getter = `${modifiers} get ${member.getName()}(): ${result.typeAsString}`;

                replacedProperties.push(getter);
            } else if (Node.isSetAccessorDeclaration(member)) {
                // setter always has exactly one param
                const param = member.getParameters()[0];
                const paramResult = decomposeType(typeChecker, param.getType());
                mergeIntoSet(replacedTypes, paramResult.replacedTypes);
                mergeIntoSet(requiredGenerics, paramResult.requiredGenerics);
                const setter = `${modifiers} set ${member.getName()}(${param.getName()}: ${paramResult.typeAsString});`;

                replacedProperties.push(setter);
            }

        }
    }

    return {
        typeParameters,
        properties: replacedProperties,
        replacedTypes,
        requiredGenerics,
    };
}

function getNodeTypeData(typeChecker: TypeChecker, node:Node, namespacePrefix?:string): TypeData[]{

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
            typeData.push(...getNodeTypeData(typeChecker, s, node.getName()));
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
            typeData.push(...getNodeTypeData(typeChecker, dec, namespacePrefix));
        }
        return typeData
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

        let classData;
        if (Node.isClassDeclaration(node)) {
            classData = stripClassDeclaration(typeChecker, node);
        }

        const typeData: TypeData[] = [{
            name,
            kind: node.getKindName(),
            node,
            classData,
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
        case ts.SyntaxKind.ClassDeclaration:
            // turn the class into a type by not omitting anything
            // this will expose all public props, and validate the
            // interfaces matches
            return `Omit<${typeStringBase},"">`;

        case ts.SyntaxKind.VariableDeclaration:
        case ts.SyntaxKind.FunctionDeclaration:
            // turn variables and functions into types
            return `typeof ${typeStringBase}`;

        default:
            return typeStringBase;
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

export function generateTypeDataForProject(packageDir: string, dependencyName: string | undefined): PackageAndTypeData {

    const basePath = dependencyName === undefined
        ? packageDir
        : tryFindDependencyPath(packageDir, dependencyName);

    const tsConfigPath =`${basePath}/tsconfig.json`;

    if (!fs.existsSync(tsConfigPath)) {
        throw new Error(`Tsconfig json does not exist: ${tsConfigPath}.\nYou may need to install the package via npm install in the package dir.`)
    }

    const packageDetails = getPackageDetails(basePath);

    const project = new Project({
        skipFileDependencyResolution: true,
        tsConfigFilePath: tsConfigPath,
    });

    const typeChecker = project.getTypeChecker()

    const file = project.getSourceFile("index.ts")
    if(file == undefined){
        throw new Error("index.ts does not exist in package source.\nYou may need to install the package via npm install in the package dir.");
    }
    const typeData: TypeData[]=[];

    const exportedDeclarations = file.getExportedDeclarations();
    for(const declarations of exportedDeclarations.values()){
        for(const dec of declarations){
            typeData.push(...getNodeTypeData(typeChecker, dec));
        }
    }
    return {
        packageDetails,
        typeData: typeData.sort((a,b)=>a.name.localeCompare(b.name)),
    };
}

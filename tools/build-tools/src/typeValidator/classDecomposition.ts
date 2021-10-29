/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ClassDeclaration, Node, Scope, TypeChecker } from "ts-morph";
import { decomposeType, decomposeTypes, GenericsInfo, typeToString } from "./typeDecomposition";

/**
 * Total result of a class decomposition which may be reconstructed into an equivalent class
 * declaration to bypass issues with normal class type comparisions
 */
export interface ClassData {
    readonly typeParameters: string[];
    readonly properties: string[];
    readonly replacedTypes: Set<string>;
    readonly requiredGenerics: GenericsInfo;
}

function mergeIntoSet<T>(into: Set<T>, from: Set<T>) {
    from.forEach((v) => into.add(v));
}

/**
 * Break down a normal class declaration into all its parts to facilitate type comparision
 * - Remove external type dependencies to examine separately
 * - Convert static properties into instance properties so they affect type compatibility
 *
 * TODO: inline object types e.g. Promise<{a: ICustomInterface, b: CustomClass}>
 * TODO: conditionals, extensions on generics
 * TODO: access modifier changes (e.g. making readonly)
 * TODO: type arguments on heritage types
 * TODO: handle abstract classes
 * TODO: handle method overloads
 * TODO: handle generators, decorators?
 * @param typeChecker - The TypeChecker object from the node's TS project for getting type names
 * @param node - The class declaration node to decompose
 * @returns - ClassData for the decomposed class declaration
 */
export function decomposeClassDeclaration(typeChecker: TypeChecker, node: ClassDeclaration): ClassData {
    const replacedTypes = new Set<string>();
    const replacedProperties: string[] = [];
    const requiredGenerics = new GenericsInfo();
    const typeParameters: string[] = [];

    node.getTypeParameters().forEach((tp) => {
        typeParameters.push(typeToString(typeChecker, tp.getType()));
    })

    // Convert extensions and implementations to properties for comparison because they
    // can't be replaced as string literal types
    const extendsExpr = node.getExtends();
    if (extendsExpr !== undefined) {
        const result = decomposeType(typeChecker, extendsExpr.getType());
        mergeIntoSet(replacedTypes, result.replacedTypes);
        requiredGenerics.merge(result.requiredGenerics);
        const typeName = typeToString(typeChecker, extendsExpr.getType()).replace(/[^\w]/g, "_");
        replacedProperties.push(`__extends__${typeName}: ${result.typeAsString};`);
    }
    node.getImplements().forEach((ex) => {
        const result = decomposeType(typeChecker, ex.getType());
        mergeIntoSet(replacedTypes, result.replacedTypes);
        requiredGenerics.merge(result.requiredGenerics);
        const typeName = typeToString(typeChecker, ex.getType()).replace(/[^\w]/g, "_");
        replacedProperties.push(`__implements__${typeName}: ${result.typeAsString};`);
    });

    for (const member of node.getMembers()) {
        // Pass over Private properties because they don't affect the public API
        const modifierList = member.getModifiers().map((val) => val.getText());
        if (modifierList.indexOf(Scope.Private) != -1) {
            continue;
        }

        let propNamePrefix = "";
        const modifiers = modifierList.filter((modifier) => {
            switch (modifier) {
                case Scope.Protected:
                case "static": {
                    propNamePrefix += `__${modifier}__`;
                    return false;
                }
                case "async":
                    return false;
                default:
                    return true;
            }
        }).join(" ");
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
                requiredGenerics.merge(typeArgsResult.requiredGenerics);
                typeArgsString = `<${typeArgsResult.typeAsString}>`;
            }

            // Handle parameters
            let paramsString = "";
            paramsString = member.getParameters().map((p) => {
                const subResult = decomposeType(typeChecker, p.getType());
                mergeIntoSet(replacedTypes, subResult.replacedTypes);
                requiredGenerics.merge(subResult.requiredGenerics);
                return `${p.getName()}: ${subResult.typeAsString}`;
            }).join(", ");

            // Handle return type
            const returnResult = decomposeType(typeChecker, member.getReturnType());
            mergeIntoSet(replacedTypes, returnResult.replacedTypes);
            requiredGenerics.merge(returnResult.requiredGenerics);

            // Other stuff
            const qToken = member.hasQuestionToken() ? "?" : "";

            const method = `${modifiers} ${propNamePrefix}${member.getName()}${qToken}${typeArgsString}(${paramsString}): ${returnResult.typeAsString};`;

            replacedProperties.push(method);
        } else if (Node.isConstructorDeclaration(member)) {
            // Handle parameters
            let paramsString = "";
            paramsString = member.getParameters().map((p) => {
                const subResult = decomposeType(typeChecker, p.getType());
                mergeIntoSet(replacedTypes, subResult.replacedTypes);
                requiredGenerics.merge(subResult.requiredGenerics);

                // Handle inline property declarations
                const paramModifiers = p.getModifiers().map((val) => val.getText());
                if (paramModifiers.length > 0 && paramModifiers.indexOf(Scope.Private) === -1) {
                    let prefix = "__ctorProp__";
                    const protectedIndex = paramModifiers.indexOf(Scope.Protected);
                    if (protectedIndex !== -1) {
                        paramModifiers.splice(protectedIndex, 1);
                        prefix += "__protected__";
                    }
                    const qToken = p.hasQuestionToken() ? "?" : "";
                    const ctorProperty = `${paramModifiers.join(" ")} ${prefix}${p.getName()}${qToken}: ${subResult.typeAsString};`;
                    replacedProperties.push(ctorProperty);
                }

                return `${p.getName()}: ${subResult.typeAsString}`;
            }).join(", ");

            const method = `${modifiers} __ctorDecl__(${paramsString}): void;`;

            replacedProperties.push(method);
        } else if (Node.isPropertyDeclaration(member)) {
            const result = decomposeType(typeChecker, member.getType());
            mergeIntoSet(replacedTypes, result.replacedTypes);
            requiredGenerics.merge(result.requiredGenerics);
            const qToken = member.hasQuestionToken() ? "?" : "";
            const property = `${modifiers} ${propNamePrefix}${member.getName()}${qToken}: ${result.typeAsString};`;

            replacedProperties.push(property);
        } else if (Node.isGetAccessorDeclaration(member)) {
            // return type should always exist for a getter
            const result = decomposeType(typeChecker, member.getReturnType());
            mergeIntoSet(replacedTypes, result.replacedTypes);
            requiredGenerics.merge(result.requiredGenerics);
            const getter = `${modifiers} get ${propNamePrefix}${member.getName()}(): ${result.typeAsString}`;

            replacedProperties.push(getter);
        } else if (Node.isSetAccessorDeclaration(member)) {
            // setter always has exactly one param
            const param = member.getParameters()[0];
            const paramResult = decomposeType(typeChecker, param.getType());
            mergeIntoSet(replacedTypes, paramResult.replacedTypes);
            requiredGenerics.merge(paramResult.requiredGenerics);
            const setter = `${modifiers} set ${propNamePrefix}${member.getName()}(${param.getName()}: ${paramResult.typeAsString});`;

            replacedProperties.push(setter);
        }
    }

    return {
        typeParameters,
        properties: replacedProperties,
        replacedTypes,
        requiredGenerics,
    };
}
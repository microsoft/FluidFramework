/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ClassDeclaration,
    ConstructorDeclaration,
    DiagnosticCategory,
    GetAccessorDeclaration,
    MethodDeclaration,
    MethodSignature,
    ModifierableNode,
    Node,
    Project,
    PropertyDeclaration,
    PropertySignature,
    Scope,
    SetAccessorDeclaration,
    TypeChecker,
} from "ts-morph";
import { decomposeType, decomposeTypes, GenericsInfo, typeToString } from "./typeDecomposition";
import { BreakingIncrement, IValidator, log } from "./validatorUtils";

function mergeIntoSet<T>(into: Set<T>, from: Set<T>) {
    from.forEach((v) => into.add(v));
}

function getModifiersAndPrefix(member: ModifierableNode): [string, string] {
    const modifierList = member.getModifiers().map((val) => val.getText());
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

    return [modifiers, propNamePrefix];
}

export function getMethodReplacement(
    typeChecker: TypeChecker,
    requiredGenerics: GenericsInfo,
    replacedTypes: Set<string>,
    member: MethodDeclaration | MethodSignature,
): string {
    // Handle modifiers if applicable
    let modifiers = "";
    let propNamePrefix = "";
    if (Node.isModifierableNode(member)) {
        [modifiers, propNamePrefix] = getModifiersAndPrefix(member);
    }

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

        // Convert initializers to q tokens
        const qToken = p.hasInitializer() ? "?" : "";

        return `${p.getName()}${qToken}: ${subResult.typeAsString}`;
    }).join(", ");

    // Handle return type
    const returnResult = decomposeType(typeChecker, member.getReturnType());
    mergeIntoSet(replacedTypes, returnResult.replacedTypes);
    requiredGenerics.merge(returnResult.requiredGenerics);

    // Other stuff
    const qToken = member.hasQuestionToken() ? "?" : "";

    const method = `${modifiers} ${propNamePrefix}${member.getName()}${qToken}${typeArgsString}(${paramsString}): ${returnResult.typeAsString};`;

    return method;
}

export function getPropertyReplacement(
    typeChecker: TypeChecker,
    requiredGenerics: GenericsInfo,
    replacedTypes: Set<string>,
    member: PropertyDeclaration | PropertySignature,
): string {
    // Handle modifiers
    const [modifiers, propNamePrefix] = getModifiersAndPrefix(member);

    const result = decomposeType(typeChecker, member.getType());
    mergeIntoSet(replacedTypes, result.replacedTypes);
    requiredGenerics.merge(result.requiredGenerics);
    const qToken = member.hasQuestionToken() ? "?" : "";
    const property = `${modifiers} ${propNamePrefix}${member.getName()}${qToken}: ${result.typeAsString};`;

    return property;
}

export function getConstructorReplacements(
    typeChecker: TypeChecker,
    requiredGenerics: GenericsInfo,
    replacedTypes: Set<string>,
    member: ConstructorDeclaration,
): string[] {
    const replacedMembers: string[] = [];

    // Handle modifiers
    const [modifiers, propNamePrefix] = getModifiersAndPrefix(member);

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
            replacedMembers.push(ctorProperty);
        }

        return `${p.getName()}: ${subResult.typeAsString}`;
    }).join(", ");

    const method = `${modifiers} __ctorDecl__(${paramsString}): void;`;

    replacedMembers.push(method);
    return replacedMembers;
}

export function getGetterReplacement(
    typeChecker: TypeChecker,
    requiredGenerics: GenericsInfo,
    replacedTypes: Set<string>,
    member: GetAccessorDeclaration,
): string {
    // Handle modifiers
    const [modifiers, propNamePrefix] = getModifiersAndPrefix(member);

    // Handle return type
    const result = decomposeType(typeChecker, member.getReturnType());
    mergeIntoSet(replacedTypes, result.replacedTypes);
    requiredGenerics.merge(result.requiredGenerics);
    const getter = `${modifiers} get ${propNamePrefix}${member.getName()}(): ${result.typeAsString}`;

    return getter;
}

export function getSetterReplacement(
    typeChecker: TypeChecker,
    requiredGenerics: GenericsInfo,
    replacedTypes: Set<string>,
    member: SetAccessorDeclaration,
): string {
    // Handle modifiers
    const [modifiers, propNamePrefix] = getModifiersAndPrefix(member);

    // setter delcaration must always has exactly one param
    const param = member.getParameters()[0];
    const paramResult = decomposeType(typeChecker, param.getType());
    mergeIntoSet(replacedTypes, paramResult.replacedTypes);
    requiredGenerics.merge(paramResult.requiredGenerics);
    const setter = `${modifiers} set ${propNamePrefix}${member.getName()}(${param.getName()}: ${paramResult.typeAsString});`;

    return setter;
}

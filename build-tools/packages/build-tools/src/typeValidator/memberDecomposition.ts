/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    CallSignatureDeclaration,
    ClassDeclaration,
    ConstructorDeclaration,
    DiagnosticCategory,
    GetAccessorDeclaration,
    IndexSignatureDeclaration,
    MethodDeclaration,
    MethodSignature,
    ModifierableNode,
    Node,
    Project,
    PropertyDeclaration,
    PropertySignature,
    Scope,
    SetAccessorDeclaration,
    Type,
    TypeChecker,
} from "ts-morph";

import { GenericsInfo, decomposeType, decomposeTypes, typeToString } from "./typeDecomposition";
import { BreakingIncrement, IValidator, log } from "./validatorUtils";

function mergeIntoSet<T>(into: Set<T>, from: Set<T>) {
    from.forEach((v) => into.add(v));
}

function getModifiersAndPrefix(member: ModifierableNode): [string, string] {
    const modifierList = member.getModifiers().map((val) => val.getText());
    let propNamePrefix = "";
    const modifiers = modifierList
        .filter((modifier) => {
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
        })
        .join(" ");

    return [modifiers, propNamePrefix];
}

function decomposeAndMerge(
    typeChecker: TypeChecker,
    requiredGenerics: GenericsInfo,
    replacedTypes: Set<string>,
    type: Type,
): string {
    const result = decomposeType(typeChecker, type);
    mergeIntoSet(replacedTypes, result.replacedTypes);
    requiredGenerics.merge(result.requiredGenerics);
    return result.typeAsString;
}

/**
 * E.g. (event: "error", listener: (message: any) => void);
 * CallSignature:
 *      TypeParameters_opt ( ParameterList_opt ) TypeAnnotation_opt
 */
export function getCallSignatureReplacement(
    typeChecker: TypeChecker,
    requiredGenerics: GenericsInfo,
    replacedTypes: Set<string>,
    member: CallSignatureDeclaration,
): string {
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
    paramsString = member
        .getParameters()
        .map((p) => {
            const subResultType = decomposeAndMerge(
                typeChecker,
                requiredGenerics,
                replacedTypes,
                p.getType(),
            );

            // Convert initializers to q tokens
            const qToken = p.hasInitializer() ? "?" : "";

            return `${p.getName()}${qToken}: ${subResultType}`;
        })
        .join(", ");

    // Handle return type
    const returnType = decomposeAndMerge(
        typeChecker,
        requiredGenerics,
        replacedTypes,
        member.getReturnType(),
    );

    const call = `${typeArgsString}(${paramsString}): ${returnType};`;

    return call;
}

/**
 * MethodSignature:
 *      PropertyName ?_opt CallSignature
 */
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
    paramsString = member
        .getParameters()
        .map((p) => {
            const subResultType = decomposeAndMerge(
                typeChecker,
                requiredGenerics,
                replacedTypes,
                p.getType(),
            );

            // Convert initializers to q tokens
            const qToken = p.hasInitializer() ? "?" : "";

            return `${p.getName()}${qToken}: ${subResultType}`;
        })
        .join(", ");

    // Handle return type
    const returnType = decomposeAndMerge(
        typeChecker,
        requiredGenerics,
        replacedTypes,
        member.getReturnType(),
    );

    // Q token
    const qToken = member.hasQuestionToken() ? "?" : "";

    const method = `${modifiers} ${propNamePrefix}${member.getName()}${qToken}${typeArgsString}(${paramsString}): ${returnType};`;

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

    const propertyType = decomposeAndMerge(
        typeChecker,
        requiredGenerics,
        replacedTypes,
        member.getType(),
    );
    const qToken = member.hasQuestionToken() ? "?" : "";
    const property = `${modifiers} ${propNamePrefix}${member.getName()}${qToken}: ${propertyType};`;

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
    paramsString = member
        .getParameters()
        .map((p) => {
            const subResultType = decomposeAndMerge(
                typeChecker,
                requiredGenerics,
                replacedTypes,
                p.getType(),
            );

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
                const ctorProperty = `${paramModifiers.join(
                    " ",
                )} ${prefix}${p.getName()}${qToken}: ${subResultType};`;
                replacedMembers.push(ctorProperty);
            }

            return `${p.getName()}: ${subResultType}`;
        })
        .join(", ");

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
    const returnType = decomposeAndMerge(
        typeChecker,
        requiredGenerics,
        replacedTypes,
        member.getReturnType(),
    );
    const getter = `${modifiers} get ${propNamePrefix}${member.getName()}(): ${returnType}`;

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
    const paramType = decomposeAndMerge(
        typeChecker,
        requiredGenerics,
        replacedTypes,
        param.getType(),
    );
    const setter = `${modifiers} set ${propNamePrefix}${member.getName()}(${param.getName()}: ${paramType});`;

    return setter;
}

/**
 * E.g. [index: string]: string;
 */
export function getIndexSignatureReplacement(
    typeChecker: TypeChecker,
    requiredGenerics: GenericsInfo,
    replacedTypes: Set<string>,
    member: IndexSignatureDeclaration,
): string {
    // Handle modifiers if applicable
    // No prefixes used for index signatures
    let modifiers = "";
    if (Node.isModifierableNode(member)) {
        [modifiers] = getModifiersAndPrefix(member);
    }

    // Handle key type (it's always string or number for index signatures)
    const keyTypeString = typeToString(typeChecker, member.getKeyType());

    // Handle return type
    const returnType = decomposeAndMerge(
        typeChecker,
        requiredGenerics,
        replacedTypes,
        member.getReturnType(),
    );

    const index = `${modifiers} [${member.getKeyName()}: ${keyTypeString}]: ${returnType};`;

    return index;
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ClassDeclaration, DiagnosticCategory, Node, Project, Scope, TypeChecker } from "ts-morph";
import { decomposeType, decomposeTypes, GenericsInfo, typeToString } from "./typeDecomposition";
import { BreakingIncrement, IValidator, log } from "./validatorUtils";

/**
 * Total result of a class decomposition which may be reconstructed into an equivalent class
 * declaration to bypass issues with normal class type comparisions
 */
interface ClassData {
    readonly name: string;
    readonly typeParameters: string[];
    readonly properties: string[];
    readonly replacedTypes: Set<string>;
    readonly requiredGenerics: GenericsInfo;
}

function mergeIntoSet<T>(into: Set<T>, from: Set<T>) {
    from.forEach((v) => into.add(v));
}

export class ClassValidator implements IValidator {
    private oldTypeData?: ClassData;
    private newTypeData?: ClassData;

    public decomposeDeclarations(
        oldTypeChecker: TypeChecker,
        oldDecl: ClassDeclaration,
        newTypeChecker: TypeChecker,
        newDecl: ClassDeclaration,
    ) {
        this.oldTypeData = this.decompose(oldTypeChecker, oldDecl);
        this.newTypeData = this.decompose(newTypeChecker, newDecl);
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
    private decompose(typeChecker: TypeChecker, node: ClassDeclaration): ClassData {
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

                // cases where param default value causes breaking changes:
                // 1. default value is added in the new version but not present in the old
                // version (param now optional, method signature changed)
                // 2. default value type changed (code behavior will differ)

                // Handle parameters
                let paramsString = "";
                paramsString = member.getParameters().map((p) => {
                    const subResult = decomposeType(typeChecker, p.getType());
                    mergeIntoSet(replacedTypes, subResult.replacedTypes);
                    requiredGenerics.merge(subResult.requiredGenerics);

                    // pass in param as optional (with ? token)
                    if(p.hasInitializer()){
                        return `${p.getName()}?: ${subResult.typeAsString}`;
                    }

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
            name: node.getName()!,
            typeParameters,
            properties: replacedProperties,
            replacedTypes,
            requiredGenerics,
        };
    }

    public validate(project: Project, pkgDir: string) : BreakingIncrement {
        // Check for major increment.  This may also tell us a minor increment is required
        // in some situations
        const typeIncrement = this.checkMajorIncrement(project, pkgDir);
        if (typeIncrement !== BreakingIncrement.none) {
            return typeIncrement;
        } else if (this.checkMinorIncrement(project, pkgDir)) {
            // If no major increment, check for minor increment
            return BreakingIncrement.minor;
        } else {
            return BreakingIncrement.none;
        }
    }

    private checkMajorIncrement(project: Project, pkgDir: string): BreakingIncrement {
        if (this.oldTypeData === undefined || this.newTypeData === undefined) {
            throw new Error("missing typedata");
        }

        // Check for major increment through transitivity then bivariant assignment
        // Type decomposition will have converted the class into a form where this is
        // valid for finding major breaking changes
        const testFile = this.buildClassTestFileMajor(
                `old${this.oldTypeData.name}`,
                this.oldTypeData,
                `new${this.newTypeData.name}`,
                this.newTypeData,
            );
            log(testFile);

        // Create a source file in the project and check for diagnostics
        const sourcePath = `${pkgDir}/src/test/typeValidation.spec.ts`;
        const sourceFile = project.createSourceFile(sourcePath, testFile);
        const diagnostics = sourceFile.getPreEmitDiagnostics();
        for (const diagnostic of diagnostics) {
            if (diagnostic.getCategory() === DiagnosticCategory.Error) {
                log(diagnostic.getMessageText().toString());
            } else {
                log(`non-error diagnostic found: ${diagnostic.getMessageText().toString()}`);
            }
        }

        project.removeSourceFile(sourceFile);

        if (diagnostics.length > 0) {
            return BreakingIncrement.major;
        }
        return BreakingIncrement.none;
    }

    private checkMinorIncrement(project: Project, pkgDir: string): BreakingIncrement {
        if (this.oldTypeData === undefined || this.newTypeData === undefined) {
            throw new Error("missing typedata");
        }

        // check for minor increment by comparing exact types
        const testFile = this.buildClassTestFileMinor(
            `old${this.oldTypeData.name}`,
            this.oldTypeData,
            `new${this.newTypeData.name}`,
            this.newTypeData,
        );
        log(testFile);

        // Create a source file in the project and check for diagnostics
        const sourcePath = `${pkgDir}/src/test/typeValidation.spec.ts`;
        const sourceFile = project.createSourceFile(sourcePath, testFile);
        const diagnostics = sourceFile.getPreEmitDiagnostics();
        for (const diagnostic of diagnostics) {
            if (diagnostic.getCategory() === DiagnosticCategory.Error) {
                log(diagnostic.getMessageText().toString());
            } else {
                log(`non-error diagnostic found: ${diagnostic.getMessageText().toString()}`);
            }
        }

        project.removeSourceFile(sourceFile);

        if (diagnostics.length > 0) {
            return BreakingIncrement.minor;
        }
        return BreakingIncrement.none;
    }

    private buildClassTestFileMajor(
        oldClassName: string,
        oldClassData: ClassData,
        newClassName: string,
        newClassData: ClassData,
    ): string {
        const fileLines: string[] = [];

        const requiredGenerics = new GenericsInfo(oldClassData.requiredGenerics);
        requiredGenerics.merge(newClassData.requiredGenerics);
        for (const [generic, paramCount] of requiredGenerics) {
            const numberArray = Array.from(Array(paramCount).keys());
            const typeParams = numberArray.map((n) => `T${n} = any`).join(", ");
            const typedProperties = numberArray.map((n) => `myVar${n}: T${n};`).join("\n");
            fileLines.push(`interface ${generic}<${typeParams}> {`);
            fileLines.push(typedProperties);
            fileLines.push(`};`);
        }

        let oldTypeParameters = oldClassData.typeParameters.join(", ");
        oldTypeParameters = oldTypeParameters === "" ? oldTypeParameters : `<${oldTypeParameters}>`;
        fileLines.push(`declare class ${oldClassName}${oldTypeParameters} {`);
        fileLines.push(...oldClassData.properties);
        fileLines.push("}");

        let newTypeParameters = newClassData.typeParameters.join(", ");
        newTypeParameters = newTypeParameters === "" ? newTypeParameters : `<${newTypeParameters}>`;
        fileLines.push(`declare class ${newClassName}${newTypeParameters} {`);
        fileLines.push(...newClassData.properties);
        fileLines.push("}");

        const oldTypeArgs = oldClassData.typeParameters.map(() => "any").join(", ");
        const oldClassType = oldTypeArgs === "" ? oldClassName : `${oldClassName}<${oldTypeArgs}>`;
        const newTypeArgs = newClassData.typeParameters.map(() => "any").join(", ");
        const newClassType = newTypeArgs === "" ? newClassName : `${newClassName}<${newTypeArgs}>`;
        fileLines.push(`const oldToNew: ${newClassType} = undefined as any as ${oldClassType}`);
        fileLines.push(`const newToOld: ${oldClassType} = undefined as any as ${newClassType}`);

        const declaration = fileLines.join("\n");
        return declaration;
    }

    private buildClassTestFileMinor(
        oldClassName: string,
        oldClassData: ClassData,
        newClassName: string,
        newClassData: ClassData,
    ): string {
        const fileLines: string[] = [];

        fileLines.push(`type Equals<X, Y> = (<T>() => (T extends X ? 1 : 2)) extends`);
        fileLines.push(`    (<T>() => (T extends Y ? 1 : 2)) ? true : false;`);
        fileLines.push(`let trueVal: true = true;`);

        const requiredGenerics = new GenericsInfo(oldClassData.requiredGenerics);
        requiredGenerics.merge(newClassData.requiredGenerics);
        for (const [generic, paramCount] of requiredGenerics) {
            const numberArray = Array.from(Array(paramCount).keys());
            const typeParams = numberArray.map((n) => `T${n} = any`).join(", ");
            const typedProperties = numberArray.map((n) => `myVar${n}: T${n};`).join("\n");
            fileLines.push(`interface ${generic}<${typeParams}> {`);
            fileLines.push(typedProperties);
            fileLines.push(`};`);
        }

        let oldTypeParameters = oldClassData.typeParameters.join(", ");
        oldTypeParameters = oldTypeParameters === "" ? oldTypeParameters : `<${oldTypeParameters}>`;
        fileLines.push(`declare class ${oldClassName}${oldTypeParameters} {`);
        fileLines.push(...oldClassData.properties);
        fileLines.push("}");

        let newTypeParameters = newClassData.typeParameters.join(", ");
        newTypeParameters = newTypeParameters === "" ? newTypeParameters : `<${newTypeParameters}>`;
        fileLines.push(`declare class ${newClassName}${newTypeParameters} {`);
        fileLines.push(...newClassData.properties);
        fileLines.push("}");

        const oldTypeArgs = oldClassData.typeParameters.map(() => "any").join(", ");
        const oldClassType = oldTypeArgs === "" ? oldClassName : `${oldClassName}<${oldTypeArgs}>`;
        const newTypeArgs = newClassData.typeParameters.map(() => "any").join(", ");
        const newClassType = newTypeArgs === "" ? newClassName : `${newClassName}<${newTypeArgs}>`;
        fileLines.push(`trueVal = undefined as any as Equals<${newClassType}, ${oldClassType}>;`);

        const declaration = fileLines.join("\n");
        return declaration;
    }
}

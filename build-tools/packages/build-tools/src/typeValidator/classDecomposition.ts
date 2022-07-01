/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ClassDeclaration, DiagnosticCategory, Node, Project, Scope, TypeChecker } from "ts-morph";
import {
    getConstructorReplacements,
    getGetterReplacement,
    getMethodReplacement,
    getPropertyReplacement,
    getSetterReplacement,
} from "./memberDecomposition";
import { decomposeType, GenericsInfo, typeToString } from "./typeDecomposition";
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
        const replacedMembers: string[] = [];
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
            // replace characters that can't be used in a method name e.g. brackets from type params
            // any types affected are handled earlier in the decomposeType call
            const typeName = typeToString(typeChecker, extendsExpr.getType()).replace(/[^\w]/g, "_");
            replacedMembers.push(`__extends__${typeName}: ${result.typeAsString};`);
        }
        node.getImplements().forEach((ex) => {
            const result = decomposeType(typeChecker, ex.getType());
            mergeIntoSet(replacedTypes, result.replacedTypes);
            requiredGenerics.merge(result.requiredGenerics);
            const typeName = typeToString(typeChecker, ex.getType()).replace(/[^\w]/g, "_");
            replacedMembers.push(`__implements__${typeName}: ${result.typeAsString};`);
        });

        for (const member of node.getMembers()) {
            // Pass over Private properties because they don't affect the public API
            const modifierList = member.getModifiers().map((val) => val.getText());
            if (modifierList.indexOf(Scope.Private) != -1) {
                continue;
            }

            if (Node.isMethodDeclaration(member)) {
                const replacement = getMethodReplacement(
                    typeChecker,
                    requiredGenerics,
                    replacedTypes,
                    member,
                );
                replacedMembers.push(replacement);
            } else if (Node.isConstructorDeclaration(member)) {
                const replacements = getConstructorReplacements(
                    typeChecker,
                    requiredGenerics,
                    replacedTypes,
                    member,
                );
                replacedMembers.push(...replacements);
            } else if (Node.isPropertyDeclaration(member)) {
                const replacement = getPropertyReplacement(
                    typeChecker,
                    requiredGenerics,
                    replacedTypes,
                    member,
                );
                replacedMembers.push(replacement);
            } else if (Node.isGetAccessorDeclaration(member)) {
                const replacement = getGetterReplacement(
                    typeChecker,
                    requiredGenerics,
                    replacedTypes,
                    member,
                );
                replacedMembers.push(replacement);
            } else if (Node.isSetAccessorDeclaration(member)) {
                const replacement = getSetterReplacement(
                    typeChecker,
                    requiredGenerics,
                    replacedTypes,
                    member,
                );
                replacedMembers.push(replacement);
            }
        }

        return {
            name: node.getName()!,
            typeParameters,
            properties: replacedMembers,
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

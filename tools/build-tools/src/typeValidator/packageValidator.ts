/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import { DiagnosticCategory, Node, Project, TypeChecker } from "ts-morph";
import { PackageDetails } from "./packageJson";
import { ClassData, decomposeClassDeclaration } from "./classDecomposition";
import {
    generateTypeDataForProject,
    getFullTypeName,
    PackageAndTypeData,
    TypeData,
} from "./typeData";
import { DecompositionResult, GenericsInfo } from "./typeDecomposition";
import { log } from "./validatorUtils";

export enum BreakingIncrement {
    none = 0,
    minor = 1,
    major = minor << 1 | minor, // this makes comparisons easier
};
// TODO: correlate type name with exporting package to support name aliasing
export type BrokenTypes = Map<string, BreakingIncrement>;

export interface PackageResult {
    increment: BreakingIncrement,
    brokenTypes: BrokenTypes,
}

interface DecompositionTypeData extends TypeData {
    classData?: ClassData,
}

/**
 * TODO: handle cross-package/transitive type breaks
 * TODO: currently symbol map assumes no duplicated symbols
 * TODO: ensure all types from exported public APIs are also exported?
 * TODO: ensure type replacement accounts for broken types from the same package when
 *      checked out of order
 * TODO: ensure namespaces work
 * TODO: handle TS built-in types?
 * @param packageDetails
 * @param packageDir
 * @param brokenTypes
 * @returns
 */
export function validatePackage(
    packageDetails: PackageDetails,
    packageDir: string,
    brokenTypes: BrokenTypes,
): PackageResult {
    // for exported symbol, check major, check minor, return total increment
    let pkgIncrement = BreakingIncrement.none;
    const pkgBrokenTypes: BrokenTypes = new Map();

    // skip packages without tsconfigs or that haven't specified versions for now
    if (!fs.existsSync(`${packageDir}/tsconfig.json`) ||
        packageDetails.oldVersions === undefined ||
        packageDetails.oldVersions.length === 0) {
        return { increment: pkgIncrement, brokenTypes: pkgBrokenTypes };
    }

    // Compare only against the most recent version
    const oldVersion = packageDetails.oldVersions[packageDetails.oldVersions.length - 1];
    const newDetails: PackageAndTypeData = generateTypeDataForProject(packageDir, undefined);
    const oldDetails: PackageAndTypeData = generateTypeDataForProject(packageDir, oldVersion);
    const newTypeMap = new Map<string, TypeData>(newDetails.typeData.map((v) => [getFullTypeName(v), v]));
    const oldTypeMap = new Map<string, TypeData>(oldDetails.typeData.map((v) => [getFullTypeName(v), v]));

    // Use the new version of the package for test sources and checking diagnostics
    const project = newDetails.project;

    // Check old types first because these are the only ones that can cause a major increment
    for (const oldTypeData of oldDetails.typeData) {
        oldTypeData as DecompositionTypeData;
        const newTypeData = newTypeMap.get(getFullTypeName(oldTypeData)) as DecompositionTypeData | undefined;
        log(`Validating type ${oldTypeData.name}`);

        if (newTypeData === undefined) {
            log("Type was removed");
            // Type has been removed, package requires major increment
            pkgIncrement |= BreakingIncrement.major;
        } else {
            // Get the type data decomposition now that we need it
            tryDecomposeTypeData(oldDetails.project.getTypeChecker(), oldTypeData);
            tryDecomposeTypeData(newDetails.project.getTypeChecker(), newTypeData);

            // Check for major increment.  This may also tell us a minor increment is required
            // in some situations
            const typeIncrement = checkMajorIncrement(project, packageDir, oldTypeData, newTypeData);
            if (typeIncrement !== BreakingIncrement.none) {
                log("Check found major increment");
                pkgIncrement |= typeIncrement;
                pkgBrokenTypes.set(oldTypeData.name, typeIncrement);
            } else if (checkMinorIncrement(project, packageDir, oldTypeData, newTypeData)) {
                // If no major increment, check for minor increment
                log("Check found minor increment");
                pkgIncrement |= BreakingIncrement.minor;
                pkgBrokenTypes.set(oldTypeData.name, BreakingIncrement.minor);
            } else {
                log("Check did not find increment");
            }
        }

        // Remove the type from the current type data map once it's been examined
        newTypeMap.delete(getFullTypeName(oldTypeData));
    }

    // All remaining exports are new and should be marked for minor increment
    newTypeMap.forEach((value, key) => {
        log(`New type added ${key}`);
        pkgIncrement |= BreakingIncrement.minor;
        pkgBrokenTypes.set(key, BreakingIncrement.minor);
    });

    return { increment: pkgIncrement, brokenTypes: pkgBrokenTypes };
}

function tryDecomposeTypeData(typeChecker: TypeChecker, typeData: DecompositionTypeData): boolean {
    if (typeData.classData !== undefined) {
        return true;
    } else if (Node.isClassDeclaration(typeData.node)) {
        typeData.classData = decomposeClassDeclaration(typeChecker, typeData.node);
    } else {
        return false;
    }
    return true;
}

function checkMajorIncrement(
    project: Project,
    pkgDir: string,
    oldTypeData: DecompositionTypeData,
    newTypeData: DecompositionTypeData,
): BreakingIncrement {
    // Check for major increment through transitivity then bivariant assignment
    // Type decomposition will have converted the class into a form where this is
    // valid for finding major breaking changes
    let testFile = "";
    if (oldTypeData.classData !== undefined && newTypeData.classData !== undefined) {
        testFile = buildClassTestFileMajor(
            `old${getFullTypeName(oldTypeData)}`,
            oldTypeData.classData,
            `new${getFullTypeName(newTypeData)}`,
            newTypeData.classData,
        );
        log(testFile);
    }

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

function checkMinorIncrement(
    project: Project,
    pkgDir: string,
    oldTypeData: DecompositionTypeData,
    newTypeData: DecompositionTypeData,
): BreakingIncrement {
    // check for minor increment by comparing exact types
    let testFile = "";
    if (oldTypeData.classData !== undefined && newTypeData.classData !== undefined) {
        testFile = buildClassTestFileMinor(
            `old${getFullTypeName(oldTypeData)}`,
            oldTypeData.classData,
            `new${getFullTypeName(newTypeData)}`,
            newTypeData.classData,
        );
        log(testFile);
    }

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

function buildClassTestFileMajor(
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

function buildClassTestFileMinor(
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

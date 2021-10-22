/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DiagnosticCategory, Node, Project, TypeChecker } from "ts-morph";
import { PackageDetails } from "./packageJson";
import { ClassData, decomposeClassDeclaration } from "./classDecomposition";
import {
    generateTypeDataForProject,
    getFullTypeName,
    PackageAndTypeData,
    TypeData,
} from "./typeData";
import { GenericsInfo } from "./typeDecomposition";

export enum BreakingIncrement {
    none = 0,
    minor = 1,
    major = 1 << 1,
};
// TODO: correlate type name with exporting package to support name aliasing
type BrokenTypes = Map<string, BreakingIncrement>;

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
): [BreakingIncrement, BrokenTypes] {
    // for exported symbol, check major, check minor, return total increment
    let pkgIncrement = BreakingIncrement.none;
    const pkgBrokenTypes: BrokenTypes = new Map();

    // Compare only against the most recent version
    const oldVersion = packageDetails.oldVersions[0];
    const newDetails: PackageAndTypeData = generateTypeDataForProject(packageDir, undefined);
    const oldDetails: PackageAndTypeData = generateTypeDataForProject(packageDir, oldVersion);
    const newTypeMap = new Map<string, TypeData>(newDetails.typeData.map((v) => [getFullTypeName(v), v]));
    const oldTypeMap = new Map<string, TypeData>(oldDetails.typeData.map((v) => [getFullTypeName(v), v]));

    // Create a project for the package to use for test sources and checking diagnostics
    let tsConfigPath =`${packageDir}/tsconfig.json`;
    const project = new Project({
        skipFileDependencyResolution: true,
        tsConfigFilePath: tsConfigPath,
    });

    // Check old types first because these are the only ones that can cause a major increment
    for (const oldTypeData of oldDetails.typeData) {
        const newTypeData = newTypeMap.get(getFullTypeName(oldTypeData));
        if (newTypeData === undefined) {
            // Type has been removed, package requires major increment
            pkgIncrement |= BreakingIncrement.major;
        } else {
            // Get the type data decomposition now that we need it
            tryDecomposeTypeData(oldDetails.typeChecker, oldTypeData);
            tryDecomposeTypeData(newDetails.typeChecker, newTypeData);

            // Check for major increment.  This may also tell us a minor increment is required
            // in some situations
            const typeIncrement = checkMajorIncrement(project, packageDir, oldTypeData, newTypeData);
            if (typeIncrement !== BreakingIncrement.none) {
                console.log(`major increment check found break for ${oldTypeData.name}`);
                pkgIncrement |= typeIncrement;
                pkgBrokenTypes.set(oldTypeData.name, typeIncrement);
            } else if (checkMinorIncrement(project, packageDir, oldTypeData, newTypeData)) {
                // If no major increment, check for minor increment
                console.log(`minor increment check found break for ${oldTypeData.name}`);
                pkgIncrement |= BreakingIncrement.minor;
                pkgBrokenTypes.set(oldTypeData.name, BreakingIncrement.minor);
            } else {
                console.log(`did not find needed increment`);
            }
        }

        // Remove the type from the current type data map once it's been examined
        newTypeMap.delete(getFullTypeName(oldTypeData));
    }

    // All remaining exports are new and should be marked for minor increment
    newTypeMap.forEach((value, key) => {
        pkgIncrement |= BreakingIncrement.minor;
        pkgBrokenTypes.set(key, BreakingIncrement.minor);
    });

    return [pkgIncrement, pkgBrokenTypes];
}

function tryDecomposeTypeData(typeChecker: TypeChecker, typeData: TypeData): boolean {
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
    oldTypeData: TypeData,
    newTypeData: TypeData,
): BreakingIncrement {
    // Check for major increment through transitivity then bivariant assignment
    console.log(oldTypeData.name);
    let testFile = "";
    if (oldTypeData.classData !== undefined && newTypeData.classData !== undefined) {
        testFile = buildClassTestFileMajor(
            `old${getFullTypeName(oldTypeData)}`,
            oldTypeData.classData,
            `new${getFullTypeName(newTypeData)}`,
            newTypeData.classData,
        );
    }
    console.log(testFile);

    // Create a source file in the project and check for diagnostics
    const sourcePath = `${pkgDir}/src/test/typeValidation.spec.ts`;
    const sourceFile = project.createSourceFile(sourcePath, testFile);
    const diagnostics = sourceFile.getPreEmitDiagnostics();
    for (const diagnostic of diagnostics) {
        if (diagnostic.getCategory() === DiagnosticCategory.Error) {
            console.log(diagnostic.getMessageText().toString());
        } else {
            console.log("non-error diagnostic found");
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
    oldTypeData: TypeData,
    newTypeData: TypeData,
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
    }
    console.log(testFile);

    // Create a source file in the project and check for diagnostics
    const sourcePath = `${pkgDir}/src/test/typeValidation.spec.ts`;
    const sourceFile = project.createSourceFile(sourcePath, testFile);
    const diagnostics = sourceFile.getPreEmitDiagnostics();
    for (const diagnostic of diagnostics) {
        if (diagnostic.getCategory() === DiagnosticCategory.Error) {
            console.log(diagnostic.getMessageText().toString());
        } else {
            console.log("non-error diagnostic found");
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
    for (const generic of requiredGenerics) {
        fileLines.push(`interface ${generic}<T> { myVar: T; };`);
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

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import { Node, TypeChecker } from "ts-morph";
import { PackageDetails } from "./packageJson";
import { ClassValidator } from "./classDecomposition";
import { EnumValidator } from "./enumValidator";
import {
    generateTypeDataForProject,
    getFullTypeName,
    PackageAndTypeData,
    TypeData,
} from "./typeData";
import { BreakingIncrement, IValidator, log } from "./validatorUtils";

// TODO: correlate type name with exporting package to support name aliasing
export type BrokenTypes = Map<string, BreakingIncrement>;

export interface PackageResult {
    increment: BreakingIncrement,
    brokenTypes: BrokenTypes,
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
        const newTypeData = newTypeMap.get(getFullTypeName(oldTypeData));
        log(`Validating type ${oldTypeData.name}`);

        if (newTypeData === undefined) {
            log("Type was removed");
            // Type has been removed, package requires major increment
            pkgIncrement |= BreakingIncrement.major;
        } else {
            const validator = createSpecificValidator(
                oldDetails.project.getTypeChecker(),
                oldTypeData.node,
                newDetails.project.getTypeChecker(),
                newTypeData.node,
            );

            const typeIncrement = validator.validate(project, packageDir);
            if (typeIncrement !== BreakingIncrement.none) {
                log(`Check found increment: ${typeIncrement}`);
                pkgIncrement |= typeIncrement;
                pkgBrokenTypes.set(oldTypeData.name, typeIncrement);
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

export function createSpecificValidator(
    oldTypeChecker: TypeChecker,
    oldNode: Node,
    newTypeChecker: TypeChecker,
    newNode: Node,
): IValidator {
    if (Node.isClassDeclaration(oldNode) && Node.isClassDeclaration(newNode)) {
        const validator = new ClassValidator();
        validator.decomposeDeclarations(oldTypeChecker, oldNode, newTypeChecker, newNode);
        return validator;
    } else if (Node.isEnumDeclaration(oldNode) && Node.isEnumDeclaration(newNode)) {
        const validator = new EnumValidator();
        validator.decomposeDeclarations(oldTypeChecker, oldNode, newTypeChecker, newNode);
        return validator;
    }

    // We don't need to report if the declaration types have changed because that
    // should be detected earlier as a removal/addition pair (major increment)
    throw new Error("Unhandled export declaration type");
}

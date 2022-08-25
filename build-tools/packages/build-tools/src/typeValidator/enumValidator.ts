/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EnumDeclaration, Project, TypeChecker } from "ts-morph";
import { BreakingIncrement, IValidator } from "./validatorUtils";

interface EnumData {
    // name : value
    readonly properties: Map<string, string | number | undefined>;
}

export class EnumValidator implements IValidator {
    private oldTypeData?: EnumData;
    private newTypeData?: EnumData;

    public decomposeDeclarations(
        oldTypeChecker: TypeChecker,
        oldDecl: EnumDeclaration,
        newTypeChecker: TypeChecker,
        newDecl: EnumDeclaration,
    ) {
        this.oldTypeData = this.decompose(oldTypeChecker, oldDecl);
        this.newTypeData = this.decompose(newTypeChecker, newDecl);
    }

    private decompose(typeChecker: TypeChecker, node: EnumDeclaration): EnumData {
        const properties = new Map<string, string | number | undefined>();
        for (const member of node.getMembers()) {
            properties.set(member.getName(), member.getValue());
        }
        return { properties };
    }

    public validate(project: Project, pkgDir: string) : BreakingIncrement {
        if (this.oldTypeData === undefined || this.newTypeData === undefined) {
            throw new Error("missing typedata");
        }

        for (const [oldPropName, oldPropValue] of this.oldTypeData.properties) {
            if (!this.newTypeData.properties.has(oldPropName)) {
                return BreakingIncrement.major;
            } else {
                const newPropValue = this.newTypeData.properties.get(oldPropName);
                if (oldPropValue !== newPropValue) {
                    return BreakingIncrement.major;
                }
                this.newTypeData.properties.delete(oldPropName);
            }
        }

        if (this.newTypeData.properties.size > 0) {
            return BreakingIncrement.minor;
        }

        return BreakingIncrement.none;
    }
}

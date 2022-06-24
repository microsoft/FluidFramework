/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import os from "os";
import { Project, SourceFile } from "ts-morph"
import { createSpecificValidator } from "./../../typeValidator/packageValidator";
import { TypeData } from "../../typeValidator/typeData";
import { BreakingIncrement, enableLogging } from "./../../typeValidator/validatorUtils"

describe("Enum validator", () => {
    enableLogging(true);
    let project: Project;
    const pkgDir: string = os.tmpdir();
    before(() => {
        project = new Project({
            skipFileDependencyResolution: true,
        });
        assert(project !== undefined);
    });

    function getTypeDataForSource(sourceFile: SourceFile): TypeData {
        let typeData: TypeData;
        for (const declarations of sourceFile.getExportedDeclarations().values()) {
            typeData = { kind: "unknown", name: "typeName", node: declarations[0] };
            break;
        }
        return typeData!;
    }

    function checkIncrement(
        oldSource: string,
        newSource: string,
    ): BreakingIncrement {
        const oldSourceFile = project.createSourceFile(`${pkgDir}/src/classOld.ts`, oldSource, { overwrite: true });
        const oldTypeData = getTypeDataForSource(oldSourceFile);
        const newSourceFile = project.createSourceFile(`${pkgDir}/src/classNew.ts`, newSource, { overwrite: true });
        const newTypeData = getTypeDataForSource(newSourceFile);

        const validator = createSpecificValidator(
            project.getTypeChecker(),
            oldTypeData.node,
            project.getTypeChecker(),
            newTypeData.node,
        );

        return validator.validate(project, pkgDir);
    }

    // Adding a new enum member at the end (existing members are unchanged) is an incremental change
    it("added a new enum member at end", () => {
        const sourceOld =
        `
        export enum Enumclaw {
            Enumclaw = "thunder",
        }
        `;

        const sourceNew =
        `
        export enum Enumclaw {
            Enumclaw = "thunder",
            Kapoonis = "lightning",
        }
        `;

        const increment = checkIncrement(sourceOld, sourceNew);
        assert(increment === BreakingIncrement.minor);

    }).timeout(10000);

    // Reordering a numeric enum changes the members values and is breaking
    // TODO: Should this and the next test be exempted? The scenario is very narrow
    it("reordered a numeric enum", () => {
        const sourceOld =
        `
        export enum Enumclaw {
            E, Num, Claw,
        }
        `;

        const sourceNew =
        `
        export enum Enumclaw {
            E, Claw, Num,
        }
        `;

        const increment = checkIncrement(sourceOld, sourceNew);
        assert(increment === BreakingIncrement.major);

    }).timeout(10000);

    // Changing the types of enum members is breaking
    it("changed the enum member types", () => {
        const sourceOld =
        `
        export enum Enumclaw {
            E = 69,
            Num = 78,
            Claw = 67,
        }
        `;

        const sourceNew =
        `
        export enum Enumclaw {
            E = "E",
            Num = "N",
            Claw = "C",
        }
        `;

        const increment = checkIncrement(sourceOld, sourceNew);
        assert(increment === BreakingIncrement.major);

    }).timeout(10000);

    // Changing member values of a computed enum is not breaking (unlike a constant enum)
    // because computed members cannot be used as types (ts2535).  Adding/removing members
    // or changing members' types functions the same
    it("changed the member values of a computed enum", () => {
        const sourceOld =
        `
        export enum Enumclaw {
            Meaning = "place of evil spirits".length,
        }
        `;

        const sourceNew =
        `
        export enum Enumclaw {
            Meaning = "thundering noise".length,
        }
        `;

        const increment = checkIncrement(sourceOld, sourceNew);
        assert(increment === BreakingIncrement.none);

    }).timeout(10000);

    // Changing values of string enum members is breaking
    // TODO: Very narrow scenario, should it be exempted?
    it("changed the value of a string enum member", () => {
        const sourceOld =
        `
        export enum Enumclaw {
            Meaning = "place of evil spirits",
        }
        `;

        const sourceNew =
        `
        export enum Enumclaw {
            Meaning = "thundering noise",
        }
        `;

        const increment = checkIncrement(sourceOld, sourceNew);
        assert(increment === BreakingIncrement.major);

    }).timeout(10000);

});

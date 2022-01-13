/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import os from "os";
import { Project, SourceFile } from "ts-morph"
import {
    BreakingIncrement,
    checkMajorIncrement,
    checkMinorIncrement,
    DecompositionTypeData,
    tryDecomposeTypeData,
} from "./../../typeValidator/packageValidator";
import { enableLogging } from "./../../typeValidator/validatorUtils"

describe("Class", () => {
    enableLogging(true);
    let project: Project;
    let pkgDir: string = os.tmpdir();
    beforeEach(() => {
        project = new Project({
            skipFileDependencyResolution: true,
        });
        assert(project !== undefined);
    });

    function getTypeDataForSource(sourceFile: SourceFile): DecompositionTypeData {
        let typeData: DecompositionTypeData;
        for (const declarations of sourceFile.getExportedDeclarations().values()) {
            typeData = { kind: "unknown", name: "typeName", node: declarations[0] } as any as DecompositionTypeData;
            tryDecomposeTypeData(project.getTypeChecker(), typeData);
            break;
        }
        return typeData!;
    }

    function checkIncrement(
        project: Project,
        pkgDir: string,
        oldTypeData: DecompositionTypeData,
        newTypeData: DecompositionTypeData,
    ): BreakingIncrement {
        let increment = checkMajorIncrement(project, pkgDir, oldTypeData, newTypeData);
        if (increment === BreakingIncrement.none) {
            increment = checkMinorIncrement(project, pkgDir, oldTypeData, newTypeData);
        }
        return increment;
    }

    // scenario: added new method
    // expected result: major breaking change
    it("new method", () => {
        const classOld =
        `
        export class asdf {}
        `;
        const oldSourceFile = project.createSourceFile(`${pkgDir}/src/classOld.ts`, classOld);
        const oldTypeData = getTypeDataForSource(oldSourceFile);

        const classNew =
        `
        export class asdf {
        public qwer() { return false; };
        }
        `;
        const newSourceFile = project.createSourceFile(`${pkgDir}/src/classNew.ts`, classNew);
        const newTypeData = getTypeDataForSource(newSourceFile);

        let increment = checkIncrement(project, pkgDir, oldTypeData, newTypeData);
        assert(increment === BreakingIncrement.major);

    }).timeout(10000);

    // scenario: added new default param (method signature changed but won't break existing code)
    // expected result: minor breaking change
    it("new default value added", () => {
        const classOld =
        `
        export class asdf {
            public qewr() { return "afg"; }
        }
        `;
        const oldSourceFile = project.createSourceFile(`${pkgDir}/src/classOld.ts`, classOld);
        const oldTypeData = getTypeDataForSource(oldSourceFile);
        // cont oldClassData = decomposeClassDeclaration(project.getTypeChecker(), oldSourceFile);

        const classNew =
        `
        export class asdf {
            public qewr(param1 : string = "afg") { return "afg"; }
        }
        `;
        const newSourceFile = project.createSourceFile(`${pkgDir}/src/classNew.ts`, classNew);
        const newTypeData = getTypeDataForSource(newSourceFile);

        let increment = checkIncrement(project, pkgDir, oldTypeData, newTypeData);
        assert(increment == BreakingIncrement.minor);

    }).timeout(15000);


    // scenario: new version changes the param to a different type.
    // expected result: A major breaking change
    it("default value type changed", () => {
        const classOld =
        `
        export class asdf {
            public qewr(param1 : string = "afg") { return "afg"; }
        }
        `;
        const oldSourceFile = project.createSourceFile(`${pkgDir}/src/classOld.ts`, classOld);
        const oldTypeData = getTypeDataForSource(oldSourceFile);
        // cont oldClassData = decomposeClassDeclaration(project.getTypeChecker(), oldSourceFile);

        const classNew =
        `
        export class asdf {
            public qewr(param1 : boolean = false) { return "afg"; }
        }
        `;
        const newSourceFile = project.createSourceFile(`${pkgDir}/src/classNew.ts`, classNew);
        const newTypeData = getTypeDataForSource(newSourceFile);

        let increment = checkIncrement(project, pkgDir, oldTypeData, newTypeData);
        assert(increment == BreakingIncrement.major);

    }).timeout(15000);


    // scenario: new version removes the default value from the param, changing
    // the method signature. (optional param now required)
    // expected result: A minor breaking change
    it("default value removed", () => {
        const classOld =
        `
        export class asdf {
            public qewr(param1 : string = "afg") { return "afg"; }
        }
        `;
        const oldSourceFile = project.createSourceFile(`${pkgDir}/src/classOld.ts`, classOld);
        const oldTypeData = getTypeDataForSource(oldSourceFile);
        // cont oldClassData = decomposeClassDeclaration(project.getTypeChecker(), oldSourceFile);

        const classNew =
        `
        export class asdf {
            public qewr(param1 : string) { return "afg"; }
        }
        `;
        const newSourceFile = project.createSourceFile(`${pkgDir}/src/classNew.ts`, classNew);
        const newTypeData = getTypeDataForSource(newSourceFile);

        let increment = checkIncrement(project, pkgDir, oldTypeData, newTypeData);
        assert(increment == BreakingIncrement.minor);

    }).timeout(15000);
});

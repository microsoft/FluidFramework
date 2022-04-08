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

    // scenario: added new method
    // expected result: major breaking change
    it("new method", () => {
        const classOld =
        `
        export class asdf {}
        `;

        const classNew =
        `
        export class asdf {
        public qwer() { return false; };
        }
        `;

        let increment = checkIncrement(classOld, classNew);
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

        const classNew =
        `
        export class asdf {
            public qewr(param1 : string = "afg") { return "afg"; }
        }
        `;

        let increment = checkIncrement(classOld, classNew);
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

        const classNew =
        `
        export class asdf {
            public qewr(param1 : boolean = false) { return "afg"; }
        }
        `;

        let increment = checkIncrement(classOld, classNew);
        assert(increment == BreakingIncrement.major);

    }).timeout(15000);


    // scenario: new version removes the default value from the param, changing
    // the method signature. (optional param now required)
    // expected result: A major breaking change
    it.skip("default value removed", () => {
        const classOld =
        `
        export class asdf {
            public qewr(param1 : string = "afg") { return "afg"; }
        }
        `;

        const classNew =
        `
        export class asdf {
            public qewr(param1 : string) { return "afg"; }
        }
        `;

        let increment = checkIncrement(classOld, classNew);
        assert(increment == BreakingIncrement.major);

    }).timeout(15000);
});

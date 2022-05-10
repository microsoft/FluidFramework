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

describe("Interface", () => {
    enableLogging(true);
    let project: Project;
    let pkgDir: string = os.tmpdir();
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
        const oldSourceFile = project.createSourceFile(`${pkgDir}/src/interfaceOld.ts`, oldSource, { overwrite: true });
        const oldTypeData = getTypeDataForSource(oldSourceFile);
        const newSourceFile = project.createSourceFile(`${pkgDir}/src/interfaceNew.ts`, newSource, { overwrite: true });
        const newTypeData = getTypeDataForSource(newSourceFile);

        const validator = createSpecificValidator(
            project.getTypeChecker(),
            oldTypeData.node,
            project.getTypeChecker(),
            newTypeData.node,
        );

        return validator.validate(project, pkgDir);
    }

    describe("methods", () => {
        // scenario: added new method
        // expected result: major breaking change
        it("adds a new required method declaration", () => {
            const sourceOld =
            `
            export interface ITestInterface {}
            `;

            const sourceNew =
            `
            export interface ITestInterface {
                newMethod();
            }
            `;

            let increment = checkIncrement(sourceOld, sourceNew);
            assert.strictEqual(increment, BreakingIncrement.major);
        });

        // adding an optional method is an incremental change
        it("adds a new optional method declaration", () => {
            const sourceOld =
            `
            export interface ITestInterface {}
            `;

            const sourceNew =
            `
            export interface ITestInterface {
                newMethod?();
            }
            `;

            let increment = checkIncrement(sourceOld, sourceNew);
            assert.strictEqual(increment, BreakingIncrement.minor);
        });

        // removing a method is a breaking change
        it("removed a method declaration", () => {
            const sourceOld =
            `
            export interface ITestInterface {
                oldMethod();
            }
            `;

            const sourceNew =
            `
            export interface ITestInterface {}
            `;

            let increment = checkIncrement(sourceOld, sourceNew);
            assert.strictEqual(increment, BreakingIncrement.major);
        });

        // making a required method optional is a breaking change
        it("changes a required method declaration to optional", () => {
            const sourceOld =
            `
            export interface ITestInterface {
                newMethod();
            }
            `;

            const sourceNew =
            `
            export interface ITestInterface {
                newMethod?();
            }
            `;

            let increment = checkIncrement(sourceOld, sourceNew);
            assert.strictEqual(increment, BreakingIncrement.major);
        });

        // removing an optional method is an incremental change
        it("removed an optional method declaration", () => {
            const sourceOld =
            `
            export interface ITestInterface {
                newMethod?();
            }
            `;

            const sourceNew =
            `
            export interface ITestInterface {
            }
            `;

            let increment = checkIncrement(sourceOld, sourceNew);
            assert.strictEqual(increment, BreakingIncrement.minor);
        });

        // getters are treated the same as public methods
        // adding/removing one is a breaking change
        // TODO: getters currently unsupported in ts-morph but we don't use this/it's rare
        it.skip("added a getter", () => {
            const sourceOld =
            `
            export interface ITestInterface {
            }
            `;

            const sourceNew =
            `
            export interface ITestInterface {
                get testProperty(): string;
            }
            `;

            let increment = checkIncrement(sourceOld, sourceNew);
            assert.strictEqual(increment, BreakingIncrement.major);
        });

        // setters are treated the same as public methods
        // adding/removing one is a breaking change
        // TODO: setters currently unsupported in ts-morph but we don't use this/it's rare
        it.skip("added a setter", () => {
            const sourceOld =
            `
            export interface ITestInterface {
            }
            `;

            const sourceNew =
            `
            export interface ITestInterface {
                set setTestProperty(newTestProperty: string);
            }
            `;

            let increment = checkIncrement(sourceOld, sourceNew);
            assert.strictEqual(increment, BreakingIncrement.major);
        });

        // adding a new required method parameter is a breaking change
        it("added a new required method param", () => {
            const sourceOld =
            `
            export interface ITestInterface {
                testMethod();
            }
            `;

            const sourceNew =
            `
            export interface ITestInterface {
                testMethod(newProp: boolean);
            }
            `;

            let increment = checkIncrement(sourceOld, sourceNew);
            assert.strictEqual(increment, BreakingIncrement.major);
        });
    });

    describe("properties", () => {
        // adding a readonly modifier is a breaking change
        // TODO: handle readonly and enable this test
        it.skip("added a readonly modifier", () => {
            const sourceOld =
            `
            export interface ITestInterface {
                myProp: number;
            }
            `;

            const sourceNew =
            `
            export interface ITestInterface {
                readonly myProp: number;
            }
            `;

            let increment = checkIncrement(sourceOld, sourceNew);
            assert.strictEqual(increment, BreakingIncrement.major);
        });

        // removing a readonly modifier is an incremental change
        it("removed a readonly modifier", () => {
            const sourceOld =
            `
            export interface ITestInterface {
                readonly myProp: number;
            }
            `;

            const sourceNew =
            `
            export interface ITestInterface {
                myProp: number;
            }
            `;

            let increment = checkIncrement(sourceOld, sourceNew);
            assert.strictEqual(increment, BreakingIncrement.minor);
        });
    });

    describe("heritage", () => {
        // extends changes are breaking
        it("changed interface extensions", () => {
            const sourceOld =
            `
            interface IBaseInterface<T> { myProp: T; }
            export interface ITestInterface extends IBaseInterface<string> {}
            `;

            const sourceNew =
            `
            interface IBaseInterface<T> { myProp: T; }
            export interface ITestInterface extends IBaseInterface<number> {}
            `;

            let increment = checkIncrement(sourceOld, sourceNew);
            assert.strictEqual(increment, BreakingIncrement.major);
        });

        // structurally identical extends changes with different names are breaking
        // (this isn't actually breaking but is difficult to handle and errs on the side
        // of over-bumping)
        it("changed interface extensions that are structurally identical", () => {
            const sourceOld =
            `
            interface IBaseInterface<T> { myProp: T; }
            export interface ITestInterface extends IBaseInterface<string> {}
            `;

            const sourceNew =
            `
            interface IBaseInterface2<T> { myProp: T; }
            export interface ITestInterface extends IBaseInterface2<string> {}
            `;

            let increment = checkIncrement(sourceOld, sourceNew);
            assert.strictEqual(increment, BreakingIncrement.major);
        });

        // reordering extensions is not breaking
        it("reorders extensions", () => {
            const sourceOld =
            `
            interface ITestInterface1 {}
            interface ITestInterface2 {}
            export class TestClass implements ITestInterface1, ITestInterface2 {}
            `;

            const sourceNew =
            `
            interface ITestInterface1 {}
            interface ITestInterface2 {}
            export class TestClass implements ITestInterface2, ITestInterface1 {}
            `;

            let increment = checkIncrement(sourceOld, sourceNew);
            assert.strictEqual(increment, BreakingIncrement.none);
        });

        // Interface extensions of classes are weird in that non-breaking changes
        // of the extended class can cause downstream compile breaks of others
        // implementing the interface (e.g. addition of a private method that then
        // requires implementers of the interface to also inherit from the extended
        // class).  We don't handle this on the assumption it's incredibly rare
        it.skip("reflects changes to extended class in implementers", () => {
        });
    });

    describe("type parameters", () => {
        // type parameter changes exposed on the public API are the same as
        // equivalent typing changes
        it.skip("changes type parameters", () => {
            const sourceOld =
            `
            export interface ITestInterface {
                prop1?: Array<string>;
            }
            `;

            const sourceNew =
            `
            export interface ITestInterface<X> {
                prop1?: Array<X>;
            }
            `;

            let increment = checkIncrement(sourceOld, sourceNew);
            assert.strictEqual(increment, BreakingIncrement.major);
        });

        // changing type parameter names is not breaking
        it("renames class type parameters", () => {
            const sourceOld =
            `
            export interface ITestInterface<X, Y> {
                prop1?: Array<X>;
                prop2?: Array<Y>;
            }
            `;

            const sourceNew =
            `
            export interface ITestInterface<XXX, YYY> {
                prop1?: Array<XXX>;
                prop2?: Array<YYY>;
            }
            `;

            let increment = checkIncrement(sourceOld, sourceNew);
            assert.strictEqual(increment, BreakingIncrement.none);
        });
    });

    describe("call and index signatures", () => {
        // call signatures should behave similarly to methods on interfaces
        // adding a call signature with different parameters is a breaking change
        it("adds a call signature with different parameters", () => {
            const sourceOld =
            `
            export interface IMessages {
                (event: "Hey", message: any): any;
            }
            `;

            const sourceNew =
            `
            export interface IMessages {
                (event: "Hey", message: any): any;
                (event: "Listen", message: any): any;
            }
            `;

            let increment = checkIncrement(sourceOld, sourceNew);
            assert.strictEqual(increment, BreakingIncrement.major);
        });

        // adding an index signature is a breaking change
        it("adds an index signature", () => {
            const sourceOld =
            `
            export interface IThiccThing {
                largestCorgiBootyWidth: BigInt;
            }
            `;

            const sourceNew =
            `
            export interface IThiccThing {
                largestCorgiBootyWidth: BigInt;
                [corgi: number]: string;
            }
            `;

            let increment = checkIncrement(sourceOld, sourceNew);
            assert.strictEqual(increment, BreakingIncrement.major);
        });
    });

});

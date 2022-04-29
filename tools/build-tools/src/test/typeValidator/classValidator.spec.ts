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

    describe("methods", () => {
        // scenario: added new method
        // expected result: major breaking change
        it("adds a new method", () => {
            const classOld =
            `
            export class TestClass {}
            `;

            const classNew =
            `
            export class TestClass {
                public newMethod() { return false; }
            }
            `;

            let increment = checkIncrement(classOld, classNew);
            assert.strictEqual(increment, BreakingIncrement.major);
        });

        // adding an optional method is an incremental change
        it("adds a new optional method", () => {
            const classOld =
            `
            export class TestClass {}
            `;

            const classNew =
            `
            export class TestClass {
                public newMethod?() { return false; }
            }
            `;

            let increment = checkIncrement(classOld, classNew);
            assert.strictEqual(increment, BreakingIncrement.minor);
        });

        // removing a method is a breaking change
        it("removed a method", () => {
            const classOld =
            `
            export class TestClass {
                public oldMethod() { return false; }
            }
            `;

            const classNew =
            `
            export class TestClass {}
            `;

            let increment = checkIncrement(classOld, classNew);
            assert.strictEqual(increment, BreakingIncrement.major);
        });

        // adding or removing a private method does not affect the api
        it("added and removed a private method", () => {
            const classOld =
            `
            export class TestClass {
                private oldMethod() { return false; }
            }
            `;

            const classNew =
            `
            export class TestClass {
                private newMethod() { return false; }
            }
            `;

            let increment = checkIncrement(classOld, classNew);
            assert.strictEqual(increment, BreakingIncrement.none);
        });

        // protected methods affect the class API and are treated the same as public
        // adding/removing one is a breaking change
        it("added a protected method", () => {
            const classOld =
            `
            export class TestClass {}
            `;

            const classNew =
            `
            export class TestClass {
                protected newMethod() { return false; }
            }
            `;

            let increment = checkIncrement(classOld, classNew);
            assert.strictEqual(increment, BreakingIncrement.major);
        });

        // static methods affect the class API and are treated the same as public
        // adding/removing one is a breaking change
        it("added a static method", () => {
            const classOld =
            `
            export class TestClass {}
            `;

            const classNew =
            `
            export class TestClass {
                static newMethod() { return false; }
            }
            `;

            let increment = checkIncrement(classOld, classNew);
            assert.strictEqual(increment, BreakingIncrement.major);
        });

        // getters are treated the same as public methods
        // adding/removing one is a breaking change
        it("added a getter", () => {
            const classOld =
            `
            export class TestClass {
                private _testProperty = "sussy baka";
            }
            `;

            const classNew =
            `
            export class TestClass {
                private _testProperty = "sussy baka";
                get testProperty() { return this._testProperty; }
            }
            `;

            let increment = checkIncrement(classOld, classNew);
            assert.strictEqual(increment, BreakingIncrement.major);
        });

        // setters are treated the same as public methods
        // adding/removing one is a breaking change
        it("added a setter", () => {
            const classOld =
            `
            export class TestClass {
                private _testProperty = "sussy baka";
            }
            `;

            const classNew =
            `
            export class TestClass {
                private _testProperty = "sussy baka";
                set setTestProperty(newTestProperty: string) {
                    this._testProperty = newTestProperty;
                }
            }
            `;

            let increment = checkIncrement(classOld, classNew);
            assert.strictEqual(increment, BreakingIncrement.major);
        });

        // adding a new required method parameter is a breaking change
        it("added a new required method param", () => {
            const classOld =
            `
            export class TestClass {
                public testMethod() { return false; }
            }
            `;

            const classNew =
            `
            export class TestClass {
                public testMethod(newProp: boolean) { return false; }
            }
            `;

            let increment = checkIncrement(classOld, classNew);
            assert.strictEqual(increment, BreakingIncrement.major);
        });

        // scenario: added new default param (method signature changed but won't break existing code)
        // expected result: minor breaking change
        it("new default value added", () => {
            const classOld =
            `
            export class TestClass {
                public testMethod() { return "minotaur"; }
            }
            `;

            const classNew =
            `
            export class TestClass {
                public testMethod(param1 : string = "target") { return "minotaur"; }
            }
            `;

            let increment = checkIncrement(classOld, classNew);
            assert.strictEqual(increment, BreakingIncrement.minor);
        });

        // scenario: new version changes the param to a different type.
        // expected result: A major breaking change
        it("default value type changed", () => {
            const classOld =
            `
            export class TestClass {
                public testMethod(param1 : string = "target") { return "minotaur"; }
            }
            `;

            const classNew =
            `
            export class TestClass {
                public testMethod(param1 : boolean = false) { return "minotaur"; }
            }
            `;

            let increment = checkIncrement(classOld, classNew);
            assert.strictEqual(increment, BreakingIncrement.major);
        });

        // scenario: new version removes the default value from the param, changing
        // the method signature. (optional param now required)
        // expected result: A major breaking change
        it.skip("default value removed", () => {
            const classOld =
            `
            export class TestClass {
                public testMethod(param1 : string = "target") { return "minotaur"; }
            }
            `;

            const classNew =
            `
            export class TestClass {
                public testMethod(param1 : string) { return "minotaur"; }
            }
            `;

            let increment = checkIncrement(classOld, classNew);
            assert.strictEqual(increment, BreakingIncrement.major);
        });
    });

    describe("constructors", () => {
        // changing constructor params is a breaking change
        it("changed ctor params", () => {
            const classOld =
            `
            export class TestClass {
                constructor(
                    public param1: string,
                    private param2: number,
                ) {}
            }
            `;

            const classNew =
            `
            export class TestClass {
                constructor(
                    public param1: string,
                    private param2: number,
                    param3: boolean,
                ) {}
            }
            `;

            let increment = checkIncrement(classOld, classNew);
            assert.strictEqual(increment, BreakingIncrement.major);
        });

        // changing inline properties in the constructor is the same as changing properties
        // adding a public property is a breaking change
        it("changed inline ctor properties", () => {
            const classOld =
            `
            export class TestClass {
                constructor(
                    public param1: string,
                    private param2: number,
                ) {}
            }
            `;

            const classNew =
            `
            export class TestClass {
                constructor(
                    public param1: string,
                    public param2: number,
                ) {}
            }
            `;

            let increment = checkIncrement(classOld, classNew);
            assert.strictEqual(increment, BreakingIncrement.major);
        });

        // changing an inline constructor prop to a normal one should have no effect
        it.skip("changed inline ctor property to normal property", () => {
            const classOld =
            `
            export class TestClass {
                constructor(
                    public param1: string,
                    public param2: number,
                ) {}
            }
            `;

            const classNew =
            `
            export class TestClass {
                public param2: number;
                constructor(
                    public param1: string,
                    param2: number,
                ) {
                    this.param2 = param2;
                }
            }
            `;

            let increment = checkIncrement(classOld, classNew);
            assert.strictEqual(increment, BreakingIncrement.none);
        });
    });

    describe("properties", () => {
        // changing private properties has no effect on the class API
        it("changed private properties", () => {
            const classOld =
            `
            export class TestClass {
                public prop1 = 1;
                private prop2 = 2;
            }
            `;

            const classNew =
            `
            export class TestClass {
                public prop1 = 1;
                private prop3 = "alpha snorlax";
            }
            `;

            let increment = checkIncrement(classOld, classNew);
            assert.strictEqual(increment, BreakingIncrement.none);
        });
    });

    describe("heritage", () => {
        // extends changes are breaking
        it("changed class extensions", () => {
            const classOld =
            `
            class BaseClass<T> extends Promise<T> {}
            export class TestClass extends BaseClass<string> {}
            `;

            const classNew =
            `
            class BaseClass<T> extends Promise<T> {}
            export class TestClass extends BaseClass<number> {}
            `;

            let increment = checkIncrement(classOld, classNew);
            assert.strictEqual(increment, BreakingIncrement.major);
        });

        // structurally identical extends changes with different names are considered breaking
        // (this isn't actually breaking but is difficult to handle so we err on the side
        // of over-bumping)
        it("changed class extensions that are structurally identical", () => {
            const classOld =
            `
            class BaseClass<T> extends Promise<T> {}
            export class TestClass extends BaseClass<string> {}
            `;

            const classNew =
            `
            class BaseClass2<T> extends Promise<T> {}
            export class TestClass extends BaseClass2<string> {}
            `;

            let increment = checkIncrement(classOld, classNew);
            assert.strictEqual(increment, BreakingIncrement.major);
        });

        // changing implementations is breaking regardless of structural identicality
        // (this isn't actually breaking but is difficult to handle and errs on the side
        // of over-bumping)
        it("changed class implementations that are structurally identical", () => {
            const classOld =
            `
            interface TestInterface {}
            export class TestClass implements TestInterface {}
            `;

            const classNew =
            `
            interface TestInterface2 {}
            export class TestClass implements TestInterface2 {}
            `;

            let increment = checkIncrement(classOld, classNew);
            assert.strictEqual(increment, BreakingIncrement.major);
        });

        // reordering implementations is not breaking
        it("reorders changed class implementations", () => {
            const classOld =
            `
            interface TestInterface1 {}
            interface TestInterface2 {}
            export class TestClass implements TestInterface1, TestInterface2 {}
            `;

            const classNew =
            `
            interface TestInterface1 {}
            interface TestInterface2 {}
            export class TestClass implements TestInterface2, TestInterface1 {}
            `;

            let increment = checkIncrement(classOld, classNew);
            assert.strictEqual(increment, BreakingIncrement.none);
        });
    });

    describe("type parameters", () => {
        // removing required class type parameters is a breaking change
        it.skip("removes a required class type parameters", () => {
            const classOld =
            `
            export class TestClass<X> {
                private prop1?: Array<X>;
            }
            `;

            const classNew =
            `
            export class TestClass {
                private prop1?: Array<string>;
            }
            `;

            let increment = checkIncrement(classOld, classNew);
            assert.strictEqual(increment, BreakingIncrement.major);
        });

        /// adding required class type parameters is a breaking change
        it.skip("adds a required class type parameter", () => {
            const classOld =
            `
            export class TestClass {
                public prop1?: Array<string>;
            }
            `;

            const classNew =
            `
            export class TestClass<X> {
                public prop1?: Array<X>;
            }
            `;

            let increment = checkIncrement(classOld, classNew);
            assert.strictEqual(increment, BreakingIncrement.major);
        });

        // removing optional class type parameters is breaking
        it.skip("removes an optional class type parameter", () => {
            const classOld =
            `
            export class TestClass<X = string> {
                public prop1?: Array<X>;
            }
            `;

            const classNew =
            `
            export class TestClass {
                public prop1?: Array<string>;
            }
            `;

            let increment = checkIncrement(classOld, classNew);
            assert.strictEqual(increment, BreakingIncrement.major);
        });

        // adding optional class type parameters is incremental
        it("adds an optional class type parameter", () => {
            const classOld =
            `
            export class TestClass {
                public prop1?: Array<string>;
            }
            `;

            const classNew =
            `
            export class TestClass<X = string> {
                public prop1?: Array<X>;
            }
            `;

            let increment = checkIncrement(classOld, classNew);
            assert.strictEqual(increment, BreakingIncrement.minor);
        });

        // changing type parameter names is not breaking
        it("renames class type parameters", () => {
            const classOld =
            `
            export class TestClass<X, Y> {
                private prop1?: Array<X>;
                private prop2?: Array<Y>;
            }
            `;

            const classNew =
            `
            export class TestClass<XXX, YYY> {
                private prop1?: Array<XXX>;
                private prop2?: Array<YYY>;
            }
            `;

            let increment = checkIncrement(classOld, classNew);
            assert.strictEqual(increment, BreakingIncrement.none);
        });
    });
});

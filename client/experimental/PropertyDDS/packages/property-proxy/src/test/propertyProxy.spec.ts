/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-env jest */
/* eslint-disable no-param-reassign */
import {
    PropertyFactory, BaseProperty,
    ArrayProperty, MapProperty, SetProperty, NodeProperty,
} from "@fluid-experimental/property-properties";

import { PropertyProxy } from "..";

import {
    vector2DTemplate, vector3DTemplate, enumUnoDosTresTemplate,
    bookDataTemplate, collectionConstants, genericTemplate,
} from "./testSchemas";

// --------------------- unit testing ----------------------------------

describe("JS-Object-like property accessing ", function() {
    let rootNode;
    let testProperty;

    // ---------- toJs()-----------------------------
    let state;

    /**
     * @inheritdoc
     */
    function prepareRootNode() {
        // Creating custom properties
        testProperty = PropertyFactory.create("autodesk.appframework.tests:myGenericTemplate-1.0.0");

        // Naming the custom properties (i.e. inserting them into the root node)
        rootNode.insert("myTestProperty", testProperty);
        rootNode.insert("myBook", PropertyFactory.create(bookDataTemplate.typeid, "single"));

        rootNode.insert("constantCollections", PropertyFactory.create(collectionConstants.typeid));

        // Create an Array of NodeProperties, we should be able to create arrays of collections
        rootNode.insert("myGenericArray", PropertyFactory.create(vector2DTemplate.typeid, "array"));
        rootNode.get("myGenericArray").push(PropertyFactory.create("Int32", "array", [0, 1, 2, 3]));
        rootNode.get("myGenericArray").push(PropertyFactory.create("Int32", "map", { a: 0, b: 1, c: 2 }));
        rootNode.get("myGenericArray").push(PropertyFactory.create("NamedProperty", "set"));
        rootNode.get("myGenericArray").get(2).set(PropertyFactory.create("NamedProperty", "single"));
        rootNode.get("myGenericArray").get(2).set(PropertyFactory.create("NamedProperty", "single"));

        rootNode.insert("myGenericMap", PropertyFactory.create("NodeProperty", "map"));
        rootNode.get("myGenericMap").insert("array", PropertyFactory.create("Int32", "array", [0, 1, 2, 3]));
        rootNode.get("myGenericMap").insert("map", PropertyFactory.create("Int32", "map", { a: 0, b: 1, c: 2 }));
        rootNode.get("myGenericMap").insert("set", PropertyFactory.create("NamedProperty", "set"));
        rootNode.get("myGenericMap").get("set").set(PropertyFactory.create("NamedProperty", "single"));
        rootNode.get("myGenericMap").get("set").set(PropertyFactory.create("NamedProperty", "single"));

        // Calling things from PropertyProxy
        state = PropertyProxy.proxify(rootNode);
    }

    /**
     * @inheritdoc
     */
    function prerequisite() {
        PropertyFactory.register(bookDataTemplate);
        PropertyFactory.register(vector2DTemplate);
        PropertyFactory.register(vector3DTemplate);
        PropertyFactory.register(genericTemplate);
        PropertyFactory.register(collectionConstants);
        PropertyFactory.register(enumUnoDosTresTemplate);

        rootNode = PropertyFactory.create("NodeProperty");
        prepareRootNode();
    }

    beforeAll(prerequisite);

    describe("Proxy properties directly", function() {
        it("should throw if something other than a property is supplied", function() {
            const someNonProperty = { a: 1, name: "property" };
            expect(() => { PropertyProxy.proxify(someNonProperty as any); }).toThrow("PropertyProxy-000");
        });

        it("should return the value if a value property is supplied", function() {
            const value = PropertyProxy.proxify(rootNode.get("myTestProperty").get("myF32Number"));
            expect(typeof value).toEqual("number");
            expect(value).toEqual(3);
        });

        it("should be able to proxy Array/Map/SetProperties directly", function() {
            const proxiedI32Array =
                PropertyProxy.proxify(rootNode.resolvePath("myTestProperty.myI32Array") as ArrayProperty);
            expect(proxiedI32Array.length).toEqual(5);

            const proxiedI32Map = PropertyProxy.proxify(rootNode.resolvePath("myTestProperty.myMap") as MapProperty);
            expect(proxiedI32Map.size).toEqual(3);

            const proxiedSet = PropertyProxy.proxify(rootNode.resolvePath("myTestProperty.myBookSet") as SetProperty);
            expect(proxiedSet.size).toEqual(3);
        });
    });

    describe("JSON.stringify", function() {
        it("should not throw if called on state", function() {
            expect(() => { JSON.stringify(state); }).not.toThrow();
        });

        it("should give return {} if called on proxied Map/SetProperties", function() {
            expect(JSON.stringify(state.myTestProperty.myMap)).toEqual("{}");
            expect(JSON.stringify(state.myTestProperty.myBookSet)).toEqual("{}");
        });
    });

    describe("The following work as JS object: ", function() {
        beforeEach(function() {
            rootNode.remove("myTestProperty");
            rootNode.insert("myTestProperty", PropertyFactory.create(genericTemplate.typeid));
        });

        it("The property that is registered", function() {
            expect(typeof (testProperty)).toEqual("object");
        });

        it("should be able to obtain the proxied property and its direct children via getProperty()", function() {
            expect(state.getProperty()).toEqual(rootNode.getRoot());
            expect(state.getProperty("myTestProperty")).toEqual(rootNode.get("myTestProperty"));
            expect(state.getProperty(["myTestProperty"])).toEqual(rootNode.get("myTestProperty"));

            expect(state.getProperty("myTestProperty.myVector")).toBeUndefined();
            expect(() => { state.getProperty(["myTestProperty", "myVector"]); }).toThrow("PropertyProxy-010");
        });

        it("should be possible to use the `in` operator", function() {
            expect("myF32Number" in state.myTestProperty).toEqual(true);
            expect(0 in state.myTestProperty.myI32Array).toEqual(true);

            expect("someThingThatIsNoChild" in state.myTestProperty).toEqual(false);
            expect(
                rootNode.resolvePath("myTestProperty.myI32Array").getLength()
                in state.myTestProperty.myI32Array).toEqual(
                    false);
        });

        describe("NodeProperty", function() {
            it("should be able to insert primitive and non-primitive properties", function() {
                state.myFirstPrimitivePropertyInsertedViaProxy = PropertyFactory.create("Int32", "single", 42);
                expect(rootNode.get("myFirstPrimitivePropertyInsertedViaProxy").getValue()).toEqual(42);

                state.myFirstNonPrimitivePropertyInsertedViaProxy = PropertyFactory.create(
                    vector2DTemplate.typeid, "single", { x: 1, y: 2 },
                );
                expect(rootNode.get("myFirstNonPrimitivePropertyInsertedViaProxy").get("x").getValue()).toEqual(1);
                expect(rootNode.get("myFirstNonPrimitivePropertyInsertedViaProxy").get("y").getValue()).toEqual(2);

                // add a proxied property that has a parent and already is in the tree should throw
                expect(() => {
                    state.mySecondNonPrimitivePropertyInsertedViaProxy =
                        state.myFirstNonPrimitivePropertyInsertedViaProxy;
                }).toThrow();

                // setting non-properties should not work
                expect(() => { state.shouldNotWork = 1; }).toThrow();
                expect(() => { state.shouldNotWork2 = { a: 1 }; }).toThrow();
                expect(() => { state.shouldNotWork3 = undefined; }).toThrow();

                // Trying to set on non-dynamic property should not work
                expect(() => { state.myBook.year = PropertyFactory.create("Int32", "single", 1977); }).toThrow(
                    "PropertyProxy-001");
            });

            it("should be able to delete primitive and non-primitive properties", function() {
                let removed = delete state.myFirstPrimitivePropertyInsertedViaProxy;
                expect(removed).toEqual(true);
                expect(rootNode.get("myFirstPrimitivePropertyInsertedViaProxy")).toBeUndefined();

                removed = delete state.myFirstNonPrimitivePropertyInsertedViaProxy;
                expect(removed).toEqual(true);
                expect(rootNode.get("myFirstNonPrimitivePropertyInsertedViaProxy")).toBeUndefined();

                // Trying to delete something that is not a child of a NodeProperty should throw
                expect(() => { delete state.myTestProperty.myVector; }).toThrow("PropertyProxy-006");
            });
        });

        describe("ReferenceProperties", function() {
            beforeEach(function() {
                rootNode.resolvePath("myTestProperty.myReference*").setValue("myVector");
            });

            describe("single", function() {
                it("should access the referenced property", function() {
                    expect(state.myTestProperty.myReference.getProperty()).toEqual(
                        state.myTestProperty.myVector.getProperty());

                    rootNode.resolvePath("myTestProperty.myReference*").setValue("myI32Array[0]");
                    expect(state.myTestProperty.myReference).toEqual(0);

                    rootNode.resolvePath("myTestProperty.myReference*").setValue("/myTestProperty.myI32Array[0]");
                    expect(state.myTestProperty.myReference).toEqual(0);

                    rootNode.resolvePath("myTestProperty.myReference*").setValue("myComplexArray[0]");
                    expect(state.myTestProperty.myReference.getProperty()).toEqual(
                        state.myTestProperty.myComplexArray[0].getProperty());

                    rootNode.resolvePath("myTestProperty.myReference*").setValue("/myTestProperty.myComplexArray[0]");
                    expect(state.myTestProperty.myReference.getProperty()).toEqual(
                        state.myTestProperty.myComplexArray[0].getProperty());
                });

                it("should be able to resolve multi-hop references", function() {
                    expect(state.myTestProperty.myMultiHopReference.getProperty()).toEqual(
                        state.myTestProperty.myVector.getProperty());
                });

                it("should be able to change the referenced property", function() {
                    let oldValue = rootNode.resolvePath("myTestProperty.myVector").getValues();
                    state.myTestProperty.myReference = { x: 7, y: 8 };
                    expect(rootNode.resolvePath("myTestProperty.myVector.x").getValue()).toEqual(7);
                    expect(rootNode.resolvePath("myTestProperty.myVector.y").getValue()).toEqual(8);
                    rootNode.resolvePath("myTestProperty.myVector").setValues(oldValue);

                    oldValue = rootNode.resolvePath("myTestProperty.myI32Array[0]");
                    rootNode.resolvePath("myTestProperty.myReference*").setValue("myI32Array[0]");
                    state.myTestProperty.myReference = 10;
                    expect(state.myTestProperty.myReference).toEqual(10);
                    rootNode.resolvePath("myTestProperty.myI32Array").set(0, oldValue);

                    rootNode.resolvePath("myTestProperty.myReference*").setValue("/myTestProperty.myI32Array[0]");
                    state.myTestProperty.myReference = 10;
                    expect(state.myTestProperty.myReference).toEqual(10);
                    rootNode.resolvePath("myTestProperty.myI32Array").set(0, oldValue);

                    oldValue = rootNode.resolvePath("myTestProperty.myComplexArray[0]").getValues();
                    rootNode.resolvePath("myTestProperty.myReference*").setValue("myComplexArray[0]");
                    state.myTestProperty.myReference = { x: 7, y: 8 };
                    expect(rootNode.resolvePath("myTestProperty.myComplexArray[0].x").getValue()).toEqual(7);
                    expect(rootNode.resolvePath("myTestProperty.myComplexArray[0].y").getValue()).toEqual(8);
                    rootNode.resolvePath("myTestProperty.myComplexArray[0]").setValues(oldValue);

                    rootNode.resolvePath("myTestProperty.myReference*").setValue("/myTestProperty.myComplexArray[0]");
                    state.myTestProperty.myReference = { x: 7, y: 8 };
                    expect(rootNode.resolvePath("myTestProperty.myComplexArray[0].x").getValue()).toEqual(7);
                    expect(rootNode.resolvePath("myTestProperty.myComplexArray[0].y").getValue()).toEqual(8);
                    rootNode.resolvePath("myTestProperty.myComplexArray[0]").setValues(oldValue);
                });

                it("should be able to access the stored path via *", function() {
                    expect(state.myTestProperty["myReference*"]).toEqual("myVector");
                    expect(state.myTestProperty["myMultiHopReference*"]).toEqual("myReference");
                });

                it("should be able to obtain the reference property via getProperty() from the parent", function() {
                    expect(
                        state.myTestProperty.getProperty(["myReference", BaseProperty.PATH_TOKENS.REF]),
                    ).toEqual(rootNode.resolvePath("myTestProperty.myReference*"));

                    expect(
                        state.myTestProperty.getProperty("myReference",
                            { referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER },
                        ),
                    ).toEqual(rootNode.resolvePath("myTestProperty.myReference*"));
                });

                it("should be able to assign another path/property to reference another property", function() {
                    // Relative Path
                    state.myTestProperty["myReference*"] = "myF32Number";
                    expect(
                        state.myTestProperty.getProperty("myReference"),
                    ).toEqual(state.myTestProperty.getProperty("myF32Number"));

                    // Complicated Relative Path
                    state.myTestProperty["myReference*"] = "../myBook";
                    expect(state.myTestProperty.getProperty("myReference")).toEqual(state.getProperty("myBook"));

                    // Property
                    state.myTestProperty["myReference*"] = state.myTestProperty.myVector;
                    expect(state.myTestProperty.myReference.getProperty()).toEqual(
                        state.myTestProperty.myVector.getProperty());

                    // Absolute Path
                    state.myTestProperty["myReference*"] = "/myTestProperty.myF32Number";
                    expect(
                        state.myTestProperty.getProperty("myReference"),
                    ).toEqual(state.myTestProperty.getProperty("myF32Number"));
                });

                it("should throw if setting via * is used on a non reference property", function() {
                    expect(() => { state.myTestProperty["myF32Number*"] = "something"; }).toThrow("PropertyProxy-008");
                    expect(() => {
                        state.myTestProperty.myMap.set("firstNumber*", "something");
                    }).toThrow("PropertyProxy-008");
                    expect(() => {
                        state.myTestProperty.myI32Array["0*"] = "something";
                    }).toThrow("PropertyProxy-008");
                });

                it("should throw if not in in the same tree and referenced via absolute path", function() {
                    const prop = PropertyFactory.create<NodeProperty>("NodeProperty", "single");
                    prop.insert("ref", PropertyFactory.create("Reference", "single", "/myTestProperty.myF32Number"));
                    const proxiedProp = PropertyProxy.proxify(prop);
                    expect(() => { proxiedProp.ref = 5; }).toThrow("PropertyProxy-009");

                    rootNode.insert("prop", prop);
                    expect(() => { proxiedProp.ref = 3; }).not.toThrow();
                    rootNode.remove("prop");
                });

                it("should throw if trying to set a non valid reference", function() {
                    rootNode.resolvePath("myTestProperty.myReference*").setValue("relativeInvalid");
                    expect(() => { state.myTestProperty.myReference = 10; }).toThrow("PropertyProxy-009");

                    rootNode.resolvePath("myTestProperty.myReference*").setValue("/absoluteInvalid");
                    expect(() => { state.myTestProperty.myReference = 10; }).toThrow("PropertyProxy-009");

                    rootNode.resolvePath("myTestProperty.myReference*").setValue("myVector");
                });
            });

            describe.skip("RepositoryReference", function() {
                it("should return property if accessed via * syntax", function() {
                    expect(state["repoRef*"].getProperty()).toEqual(rootNode.resolvePath("repoRef*"));
                    expect(state.repoRefArray["0*"].getProperty()).toEqual(rootNode.resolvePath("repoRefArray[0]*"));
                    expect(state.repoRefMap.get("a*").getProperty()).toEqual(rootNode.resolvePath("repoRefMap[a]*"));
                });

                it("should be able to access properties in the repository reference", function() {
                    expect(state.repoRef.myTestProperty.myF32Number).toEqual(3);
                    expect(state.repoRefArray[0].myTestProperty.myF32Number).toEqual(3);
                    expect(state.repoRefMap.get("a").myTestProperty.myF32Number).toEqual(3);
                });

                it("should not be able to assign something via the proxy", function() {
                    expect(() => {
                        state.repoRef = state.repoRef =
                            { myTestProperty: { myVector: { x: 8, y: 7 } } };
                    }).toThrow();
                });
            });

            describe("array", function() {
                let refArraySum = 0;
                let refArray;
                const refArrayEntriesToString: string[] = [];

                beforeAll(function() {
                    refArray = rootNode.resolvePath("myTestProperty.myReferenceArray");
                    for (let i = 0; i < refArray.getLength(); ++i) {
                        const entry = refArray.get(i);
                        if (PropertyFactory.instanceOf(entry, "BaseProperty")) {
                            refArraySum += PropertyFactory.instanceOf(entry, "ContainerProperty") && entry.has("x")
                                ? entry.get("x").getValue()
                                : refArray.get(i).getValue();
                        } else {
                            refArraySum += entry;
                        }
                    }

                    // Get ref entries value(s).toString()
                    for (let i = 0; i < refArray.getLength(); ++i) {
                        const entry = refArray.get(i);
                        if (PropertyFactory.instanceOf(entry, "BaseProperty")) {
                            if (entry.isPrimitiveType()) {
                                refArrayEntriesToString.push(entry.getValue().toString());
                            } else {
                                refArrayEntriesToString.push(entry.getValues().toString());
                            }
                        } else {
                            refArrayEntriesToString.push(entry.toString());
                        }
                    }
                });

                it("should access the referenced property", function() {
                    // myF32Number
                    expect(state.myTestProperty.myReferenceArray[0]).toEqual(3);
                    expect(state.myTestProperty.myReferenceArray[1]).toEqual(3);
                    expect(state.myTestProperty.myReferenceArray[2]).toEqual(3);

                    // myVector
                    expect(state.myTestProperty.myReferenceArray[3].x).toEqual(1);
                    expect(state.myTestProperty.myReferenceArray[3].y).toEqual(2);
                    expect(state.myTestProperty.myReferenceArray[4].x).toEqual(1);
                    expect(state.myTestProperty.myReferenceArray[4].y).toEqual(2);
                    expect(state.myTestProperty.myReferenceArray[5].x).toEqual(1);
                    expect(state.myTestProperty.myReferenceArray[5].y).toEqual(2);

                    // myI32Array[0]
                    expect(state.myTestProperty.myReferenceArray[6]).toEqual(0);
                    expect(state.myTestProperty.myReferenceArray[7]).toEqual(0);
                    expect(state.myTestProperty.myReferenceArray[8]).toEqual(0);

                    // myComplexArray[0]
                    expect(state.myTestProperty.myReferenceArray[9].x).toEqual(1);
                    expect(state.myTestProperty.myReferenceArray[9].y).toEqual(2);
                    expect(state.myTestProperty.myReferenceArray[10].x).toEqual(1);
                    expect(state.myTestProperty.myReferenceArray[10].y).toEqual(2);
                    expect(state.myTestProperty.myReferenceArray[11].x).toEqual(1);
                    expect(state.myTestProperty.myReferenceArray[11].y).toEqual(2);

                    // myMap[0]
                    expect(state.myTestProperty.myReferenceArray[12]).toEqual(1111);
                    expect(state.myTestProperty.myReferenceArray[13]).toEqual(1111);
                    expect(state.myTestProperty.myReferenceArray[14]).toEqual(1111);

                    // myComplexMap[0]
                    expect(state.myTestProperty.myReferenceArray[15].x).toEqual(10);
                    expect(state.myTestProperty.myReferenceArray[15].y).toEqual(20);
                    expect(state.myTestProperty.myReferenceArray[16].x).toEqual(10);
                    expect(state.myTestProperty.myReferenceArray[16].y).toEqual(20);
                    expect(state.myTestProperty.myReferenceArray[17].x).toEqual(10);
                    expect(state.myTestProperty.myReferenceArray[17].y).toEqual(20);
                });

                it("should access the referenced property in the presence of multi-hops", function() {
                    // myF32Number
                    expect(state.myTestProperty.myReferenceArray[18]).toEqual(3);
                    expect(state.myTestProperty.myReferenceArray[19]).toEqual(3);
                    expect(state.myTestProperty.myReferenceArray[20]).toEqual(3);

                    // myVector
                    expect(state.myTestProperty.myReferenceArray[21].x).toEqual(1);
                    expect(state.myTestProperty.myReferenceArray[21].y).toEqual(2);
                    expect(state.myTestProperty.myReferenceArray[22].x).toEqual(1);
                    expect(state.myTestProperty.myReferenceArray[22].y).toEqual(2);
                    expect(state.myTestProperty.myReferenceArray[23].x).toEqual(1);
                    expect(state.myTestProperty.myReferenceArray[23].y).toEqual(2);

                    // myI32Array[0]
                    expect(state.myTestProperty.myReferenceArray[24]).toEqual(0);
                    expect(state.myTestProperty.myReferenceArray[25]).toEqual(0);
                    expect(state.myTestProperty.myReferenceArray[26]).toEqual(0);

                    // myComplexArray[0]
                    expect(state.myTestProperty.myReferenceArray[27].x).toEqual(1);
                    expect(state.myTestProperty.myReferenceArray[27].y).toEqual(2);
                    expect(state.myTestProperty.myReferenceArray[28].x).toEqual(1);
                    expect(state.myTestProperty.myReferenceArray[28].y).toEqual(2);
                    expect(state.myTestProperty.myReferenceArray[29].x).toEqual(1);
                    expect(state.myTestProperty.myReferenceArray[29].y).toEqual(2);

                    // myMap[0]
                    expect(state.myTestProperty.myReferenceArray[30]).toEqual(1111);
                    expect(state.myTestProperty.myReferenceArray[31]).toEqual(1111);
                    expect(state.myTestProperty.myReferenceArray[32]).toEqual(1111);

                    // myComplexMap[0]
                    expect(state.myTestProperty.myReferenceArray[33].x).toEqual(10);
                    expect(state.myTestProperty.myReferenceArray[33].y).toEqual(20);
                    expect(state.myTestProperty.myReferenceArray[34].x).toEqual(10);
                    expect(state.myTestProperty.myReferenceArray[34].y).toEqual(20);
                    expect(state.myTestProperty.myReferenceArray[35].x).toEqual(10);
                    expect(state.myTestProperty.myReferenceArray[35].y).toEqual(20);
                });

                it("should be able to access stored reference path strings via *", function() {
                    for (let i = 0; i < refArray.getLength(); ++i) {
                        expect(state.myTestProperty.myReferenceArray[`${i}*`]).toEqual(refArray.getValue(i));
                    }
                });

                it("for loop", function() {
                    let sum = 0;
                    for (const element of state.myTestProperty.myReferenceArray) {
                        sum += element.x ? element.x : element;
                    }

                    expect(refArraySum).toEqual(sum);
                });

                it("for-of loop", function() {
                    let sum = 0;
                    for (const entry of state.myTestProperty.myReferenceArray) {
                        sum += entry.x ? entry.x : entry;
                    }

                    expect(refArraySum).toEqual(sum);
                });

                it("check .concat() functionality", function() {
                    const concat = state.myTestProperty.myReferenceArray.concat(state.myTestProperty.myI32Array);
                    expect(concat.length).toEqual(
                        refArray.getLength() + rootNode.resolvePath("myTestProperty.myI32Array").getLength());

                    const synthToString = `${refArrayEntriesToString.join(",")
                        },${rootNode.resolvePath("myTestProperty.myI32Array").getEntriesReadOnly().toString()}`;

                    expect(concat.toString()).toEqual(synthToString);
                });

                it("check .entries() functionality", function() {
                    const iterator = state.myTestProperty.myReferenceArray.entries();

                    // myFloat32Number
                    expect(iterator.next().value[1]).toEqual(3);
                    expect(iterator.next().value[1]).toEqual(3);
                    expect(iterator.next().value[1]).toEqual(3);

                    // myVector
                    expect(iterator.next().value[1].x).toEqual(1);
                    expect(iterator.next().value[1].x).toEqual(1);
                    expect(iterator.next().value[1].x).toEqual(1);

                    // myI32Array[0]
                    expect(iterator.next().value[1]).toEqual(0);
                    expect(iterator.next().value[1]).toEqual(0);
                    expect(iterator.next().value[1]).toEqual(0);

                    // myComplexArray[0]
                    expect(iterator.next().value[1].x).toEqual(1);
                    expect(iterator.next().value[1].x).toEqual(1);
                    expect(iterator.next().value[1].x).toEqual(1);

                    // myMap[firstNumber]
                    expect(iterator.next().value[1]).toEqual(1111);
                    expect(iterator.next().value[1]).toEqual(1111);
                    expect(iterator.next().value[1]).toEqual(1111);

                    // myComplexMap[firstEntry]
                    expect(iterator.next().value[1].x).toEqual(10);
                    expect(iterator.next().value[1].x).toEqual(10);
                    expect(iterator.next().value[1].x).toEqual(10);
                });

                it("check .every() functionality", function() {
                    expect(state.myTestProperty.myReferenceArray.every((element) => {
                        return element.x ? element.x <= 10 : element <= 1111;
                    })).toEqual(true);

                    expect(state.myTestProperty.myReferenceArray.every((element) => {
                        return element.x ? element.x < 10 : element < 1111;
                    })).toEqual(false);
                });

                it("check .filter() functionality", function() {
                    const filtered = state.myTestProperty.myReferenceArray.filter((element) => (element === 1111));
                    expect(filtered.length).toEqual(6);
                    expect(filtered[0]).toEqual(1111);
                    expect(filtered[1]).toEqual(1111);
                    expect(filtered[2]).toEqual(1111);
                });

                it("check .find() functionality", function() {
                    expect(state.myTestProperty.myReferenceArray.find((element) => (element === 3))).toEqual(3);
                });

                it("check .findIndex() functionality", function() {
                    expect(state.myTestProperty.myReferenceArray.findIndex((element) => (element === 3))).toEqual(0);
                });

                it("check .foreach() functionality", function() {
                    rootNode.resolvePath("myTestProperty.myReferenceArray").push("myI32Array");

                    let referenceArraySum = 0;
                    let numNonPrimitiveProps = 0;
                    state.myTestProperty.myReferenceArray.forEach((el) => {
                        if (el.getProperty && !el.getProperty().isPrimitiveType()) {
                            numNonPrimitiveProps += 1;
                        }

                        if (el.getProperty && el.getProperty().getContext() === "array") {
                            el.forEach((anotherEl) => { referenceArraySum += anotherEl; });
                        }
                    });
                    expect(numNonPrimitiveProps).toEqual(18);
                    expect(referenceArraySum).toEqual(100);
                    rootNode.resolvePath("myTestProperty.myReferenceArray").pop();
                });

                it("check .includes() functionality", function() {
                    expect(state.myTestProperty.myReferenceArray.includes(3)).toEqual(true);
                    expect(
                        state.myTestProperty.myReferenceArray.includes(rootNode.resolvePath("myTestProperty.myVector")),
                    ).toEqual(true);
                    expect(state.myTestProperty.myReferenceArray.includes({ x: 1, y: 2 })).toEqual(false);
                });

                it("check .indexOf() functionality", function() {
                    const rA = state.myTestProperty.myReferenceArray;
                    expect(rA.indexOf(3)).toEqual(0);
                    expect(rA.indexOf(state.myTestProperty.myVector)).toEqual(3);
                    expect(rA.indexOf(state.myTestProperty.myComplexArray[0])).toEqual(9);
                });

                it("check .join() functionality", function() {
                    const joined = state.myTestProperty.myReferenceArray.join(" ");
                    expect(joined).toEqual(refArrayEntriesToString.join(" "));
                });

                it("check .lastIndexOf() functionality", function() {
                    const rA = state.myTestProperty.myReferenceArray;
                    expect(rA.lastIndexOf(3)).toEqual(20);
                    expect(rA.lastIndexOf(state.myTestProperty.myVector)).toEqual(23);
                    expect(rA.lastIndexOf(state.myTestProperty.myComplexArray[0])).toEqual(29);
                });

                it("check .map() functionality", function() {
                    const result = state.myTestProperty.myReferenceArray.map((el) => {
                        return (el < 1111 || el.x < 10);
                    });
                    expect(result.toString()).toEqual(
                        "true,true,true," +
                        "true,true,true," +
                        "true,true,true," +
                        "true,true,true," +
                        "false,false,false," +
                        "false,false,false," +
                        "true,true,true," +
                        "true,true,true," +
                        "true,true,true," +
                        "true,true,true," +
                        "false,false,false," +
                        "false,false,false");
                });

                it("check .reduce() functionality", function() {
                    expect(state.myTestProperty.myReferenceArray.reduce((accumulator, currentValue) => {
                        return accumulator + (currentValue.x ? currentValue.x : currentValue);
                    }, 0)).toEqual(refArraySum);
                });

                it("check .reduceRight() functionality", function() {
                    expect(state.myTestProperty.myReferenceArray.reduceRight((previousValue, currentValue) => {
                        return previousValue + (currentValue.x ? currentValue.x : currentValue);
                    }, 0)).toEqual(refArraySum);
                });

                it("check .some() functionality", function() {
                    expect(state.myTestProperty.myReferenceArray.some((element) => (element === 3))).toEqual(true);
                    expect(state.myTestProperty.myReferenceArray.some((element) => (element === 4))).toEqual(false);
                });

                it("check .toString() functionality", function() {
                    const synthToString = refArrayEntriesToString.join(",");
                    expect(state.myTestProperty.myReferenceArray.toString()).toEqual(synthToString);
                });

                describe("Setting", function() {
                    const reset = () => {
                        rootNode.resolvePath("myTestProperty.myF32Number").setValue(3);
                        rootNode.resolvePath("myTestProperty.myVector").setValues({ x: 1, y: 2 });
                        rootNode.resolvePath("myTestProperty.myI32Array").set(0, 0);
                        rootNode.resolvePath("myTestProperty.myComplexArray").set(0, { x: 1, y: 2 });
                        rootNode.resolvePath("myTestProperty.myMap").set("firstNumber", 1111);
                        rootNode.resolvePath("myTestProperty.myComplexMap[firstEntry]").setValues({ x: 10, y: 20 });
                        rootNode.resolvePath("myTestProperty.myReferenceArray").setValues([
                            "myF32Number",
                            "../myTestProperty.myF32Number",
                            "/myTestProperty.myF32Number",

                            "myVector",
                            "../myTestProperty.myVector",
                            "/myTestProperty.myVector",

                            "myI32Array[0]",
                            "../myTestProperty.myI32Array[0]",
                            "/myTestProperty.myI32Array[0]",

                            "myComplexArray[0]",
                            "/myTestProperty.myComplexArray[0]",
                            "../myTestProperty.myComplexArray[0]",

                            "myMap[firstNumber]",
                            "../myTestProperty.myMap[firstNumber]",
                            "/myTestProperty.myMap[firstNumber]",

                            "myComplexMap[firstEntry]",
                            "../myTestProperty.myComplexMap[firstEntry]",
                            "/myTestProperty.myComplexMap[firstEntry]",

                            "myReferenceArray[0]",
                            "myReferenceArray[1]",
                            "myReferenceArray[2]",
                            "myReferenceArray[3]",
                            "myReferenceArray[4]",
                            "myReferenceArray[5]",
                            "myReferenceArray[6]",
                            "myReferenceArray[7]",
                            "myReferenceArray[8]",
                            "myReferenceArray[9]",
                            "myReferenceArray[10]",
                            "myReferenceArray[11]",
                            "myReferenceArray[12]",
                            "myReferenceArray[13]",
                            "myReferenceArray[14]",
                            "myReferenceArray[15]",
                            "myReferenceArray[16]",
                            "myReferenceArray[17]",
                        ]);
                    };

                    beforeEach(function() {
                        reset();
                    });

                    it("should be able to change the referenced properties", function() {
                        state.myTestProperty.myReferenceArray[0] = 4;
                        expect(rootNode.resolvePath("myTestProperty.myF32Number").getValue()).toEqual(4);
                        state.myTestProperty.myReferenceArray[1] = 5;
                        expect(rootNode.resolvePath("myTestProperty.myF32Number").getValue()).toEqual(5);
                        state.myTestProperty.myReferenceArray[2] = 6;
                        expect(rootNode.resolvePath("myTestProperty.myF32Number").getValue()).toEqual(6);

                        state.myTestProperty.myReferenceArray[3] = { x: 3, y: 4 };
                        expect(rootNode.resolvePath("myTestProperty.myVector.x").getValue()).toEqual(3);
                        expect(rootNode.resolvePath("myTestProperty.myVector.y").getValue()).toEqual(4);
                        state.myTestProperty.myReferenceArray[4] = { x: 5, y: 6 };
                        expect(rootNode.resolvePath("myTestProperty.myVector.x").getValue()).toEqual(5);
                        expect(rootNode.resolvePath("myTestProperty.myVector.y").getValue()).toEqual(6);
                        state.myTestProperty.myReferenceArray[5] = { x: 7, y: 8 };
                        expect(rootNode.resolvePath("myTestProperty.myVector.x").getValue()).toEqual(7);
                        expect(rootNode.resolvePath("myTestProperty.myVector.y").getValue()).toEqual(8);

                        state.myTestProperty.myReferenceArray[6] = 1;
                        expect(rootNode.resolvePath("myTestProperty.myI32Array[0]")).toEqual(1);
                        state.myTestProperty.myReferenceArray[7] = 2;
                        expect(rootNode.resolvePath("myTestProperty.myI32Array[0]")).toEqual(2);
                        state.myTestProperty.myReferenceArray[8] = 3;
                        expect(rootNode.resolvePath("myTestProperty.myI32Array[0]")).toEqual(3);

                        state.myTestProperty.myReferenceArray[9] = { x: 3, y: 4 };
                        expect(rootNode.resolvePath("myTestProperty.myComplexArray[0].x").getValue()).toEqual(3);
                        expect(rootNode.resolvePath("myTestProperty.myComplexArray[0].y").getValue()).toEqual(4);
                        state.myTestProperty.myReferenceArray[10] = { x: 5, y: 6 };
                        expect(rootNode.resolvePath("myTestProperty.myComplexArray[0].x").getValue()).toEqual(5);
                        expect(rootNode.resolvePath("myTestProperty.myComplexArray[0].y").getValue()).toEqual(6);
                        state.myTestProperty.myReferenceArray[11] = { x: 7, y: 8 };
                        expect(rootNode.resolvePath("myTestProperty.myComplexArray[0].x").getValue()).toEqual(7);
                        expect(rootNode.resolvePath("myTestProperty.myComplexArray[0].y").getValue()).toEqual(8);

                        state.myTestProperty.myReferenceArray[12] = 1;
                        expect(rootNode.resolvePath("myTestProperty.myMap[firstNumber]")).toEqual(1);
                        state.myTestProperty.myReferenceArray[13] = 2;
                        expect(rootNode.resolvePath("myTestProperty.myMap[firstNumber]")).toEqual(2);
                        state.myTestProperty.myReferenceArray[14] = 3;
                        expect(rootNode.resolvePath("myTestProperty.myMap[firstNumber]")).toEqual(3);

                        state.myTestProperty.myReferenceArray[15] = { x: 3, y: 4 };
                        expect(rootNode.resolvePath("myTestProperty.myComplexMap[firstEntry].x").getValue()).toEqual(3);
                        expect(rootNode.resolvePath("myTestProperty.myComplexMap[firstEntry].y").getValue()).toEqual(4);
                        state.myTestProperty.myReferenceArray[16] = { x: 5, y: 6 };
                        expect(rootNode.resolvePath("myTestProperty.myComplexMap[firstEntry].x").getValue()).toEqual(5);
                        expect(rootNode.resolvePath("myTestProperty.myComplexMap[firstEntry].y").getValue()).toEqual(6);
                        state.myTestProperty.myReferenceArray[17] = { x: 7, y: 8 };
                        expect(rootNode.resolvePath("myTestProperty.myComplexMap[firstEntry].x").getValue()).toEqual(7);
                        expect(rootNode.resolvePath("myTestProperty.myComplexMap[firstEntry].y").getValue()).toEqual(8);
                    });

                    it("should be able to change the referenced properties in the presence of multi-hops", function() {
                        state.myTestProperty.myReferenceArray[18] = 4;
                        expect(rootNode.resolvePath("myTestProperty.myF32Number").getValue()).toEqual(4);
                        state.myTestProperty.myReferenceArray[19] = 5;
                        expect(rootNode.resolvePath("myTestProperty.myF32Number").getValue()).toEqual(5);
                        state.myTestProperty.myReferenceArray[20] = 6;
                        expect(rootNode.resolvePath("myTestProperty.myF32Number").getValue()).toEqual(6);

                        state.myTestProperty.myReferenceArray[21] = { x: 3, y: 4 };
                        expect(rootNode.resolvePath("myTestProperty.myVector.x").getValue()).toEqual(3);
                        expect(rootNode.resolvePath("myTestProperty.myVector.y").getValue()).toEqual(4);
                        state.myTestProperty.myReferenceArray[22] = { x: 5, y: 6 };
                        expect(rootNode.resolvePath("myTestProperty.myVector.x").getValue()).toEqual(5);
                        expect(rootNode.resolvePath("myTestProperty.myVector.y").getValue()).toEqual(6);
                        state.myTestProperty.myReferenceArray[23] = { x: 7, y: 8 };
                        expect(rootNode.resolvePath("myTestProperty.myVector.x").getValue()).toEqual(7);
                        expect(rootNode.resolvePath("myTestProperty.myVector.y").getValue()).toEqual(8);

                        state.myTestProperty.myReferenceArray[24] = 1;
                        expect(rootNode.resolvePath("myTestProperty.myI32Array[0]")).toEqual(1);
                        state.myTestProperty.myReferenceArray[25] = 2;
                        expect(rootNode.resolvePath("myTestProperty.myI32Array[0]")).toEqual(2);
                        state.myTestProperty.myReferenceArray[26] = 3;
                        expect(rootNode.resolvePath("myTestProperty.myI32Array[0]")).toEqual(3);

                        state.myTestProperty.myReferenceArray[27] = { x: 3, y: 4 };
                        expect(rootNode.resolvePath("myTestProperty.myComplexArray[0].x").getValue()).toEqual(3);
                        expect(rootNode.resolvePath("myTestProperty.myComplexArray[0].y").getValue()).toEqual(4);
                        state.myTestProperty.myReferenceArray[28] = { x: 5, y: 6 };
                        expect(rootNode.resolvePath("myTestProperty.myComplexArray[0].x").getValue()).toEqual(5);
                        expect(rootNode.resolvePath("myTestProperty.myComplexArray[0].y").getValue()).toEqual(6);
                        state.myTestProperty.myReferenceArray[29] = { x: 7, y: 8 };
                        expect(rootNode.resolvePath("myTestProperty.myComplexArray[0].x").getValue()).toEqual(7);
                        expect(rootNode.resolvePath("myTestProperty.myComplexArray[0].y").getValue()).toEqual(8);

                        state.myTestProperty.myReferenceArray[30] = 1;
                        expect(rootNode.resolvePath("myTestProperty.myMap[firstNumber]")).toEqual(1);
                        state.myTestProperty.myReferenceArray[31] = 2;
                        expect(rootNode.resolvePath("myTestProperty.myMap[firstNumber]")).toEqual(2);
                        state.myTestProperty.myReferenceArray[32] = 3;
                        expect(rootNode.resolvePath("myTestProperty.myMap[firstNumber]")).toEqual(3);

                        state.myTestProperty.myReferenceArray[33] = { x: 3, y: 4 };
                        expect(rootNode.resolvePath("myTestProperty.myComplexMap[firstEntry].x").getValue()).toEqual(3);
                        expect(rootNode.resolvePath("myTestProperty.myComplexMap[firstEntry].y").getValue()).toEqual(4);
                        state.myTestProperty.myReferenceArray[34] = { x: 5, y: 6 };
                        expect(rootNode.resolvePath("myTestProperty.myComplexMap[firstEntry].x").getValue()).toEqual(5);
                        expect(rootNode.resolvePath("myTestProperty.myComplexMap[firstEntry].y").getValue()).toEqual(6);
                        state.myTestProperty.myReferenceArray[35] = { x: 7, y: 8 };
                        expect(rootNode.resolvePath("myTestProperty.myComplexMap[firstEntry].x").getValue()).toEqual(7);
                        expect(rootNode.resolvePath("myTestProperty.myComplexMap[firstEntry].y").getValue()).toEqual(8);
                    });

                    it("should be able to assign another path/property to reference another property", function() {
                        // Relative
                        state.myTestProperty.myReferenceArray["0*"] = "myVector";
                        expect(rootNode.resolvePath("myTestProperty.myReferenceArray[0]")).toEqual(
                            rootNode.resolvePath("myTestProperty.myVector"));

                        // Complex Relative
                        state.myTestProperty.myReferenceArray["0*"] = "../myBook";
                        expect(rootNode.resolvePath("myTestProperty.myReferenceArray[0]")).toEqual(
                            rootNode.resolvePath("myBook"));

                        // Property
                        state.myTestProperty.myReferenceArray["0*"] =
                            rootNode.resolvePath("myTestProperty.myF32Number");
                        expect(rootNode.resolvePath("myTestProperty.myReferenceArray[0]")).toEqual(
                            rootNode.resolvePath("myTestProperty.myF32Number"));

                        // Absolute Path
                        state.myTestProperty.myReferenceArray["0*"] = "/myTestProperty.myVector";
                        expect(rootNode.resolvePath("myTestProperty.myReferenceArray[0]")).toEqual(
                            rootNode.resolvePath("myTestProperty.myVector"));
                    });

                    it("should be able to assign a new iterable", function() {
                        state.myTestProperty.myReferenceArray = [
                            "myVector",
                            "../myTestProperty",
                            rootNode.resolvePath("myTestProperty.myF32Number"),
                            "/myBook",
                        ];
                        expect(rootNode.resolvePath("myTestProperty.myReferenceArray[0]")).toEqual(
                            rootNode.resolvePath("myTestProperty.myVector"));
                        expect(rootNode.resolvePath("myTestProperty.myReferenceArray[1]")).toEqual(
                            rootNode.resolvePath("myTestProperty"));
                        expect(rootNode.resolvePath("myTestProperty.myReferenceArray[2]")).toEqual(
                            rootNode.resolvePath("myTestProperty.myF32Number"));
                        expect(rootNode.resolvePath("myTestProperty.myReferenceArray[3]")).toEqual(
                            rootNode.resolvePath("myBook"));
                    });

                    it("check .copyWithin() functionality", function() {
                        state.myTestProperty.myReferenceArray.copyWithin(0, 3, 4);
                        expect(rootNode.resolvePath("myTestProperty.myReferenceArray[0]")).toEqual(
                            rootNode.resolvePath("myTestProperty.myReferenceArray[3]"));
                    });

                    it("check .fill() functionality", function() {
                        state.myTestProperty.myReferenceArray.fill("myVector");
                        for (let i = 0; i < state.myTestProperty.length; ++i) {
                            expect(rootNode.resolvePath("myTestProperty.myReferenceArray").get(i)).toEqual(
                                rootNode.resolvePath("myTestProperty.myVector"));
                        }
                    });

                    it("check .pop() functionality", function() {
                        const proxiedRefArray = state.myTestProperty.myReferenceArray;
                        const popped = proxiedRefArray.pop();
                        expect(popped.getProperty())
                            .toEqual(rootNode.resolvePath("myTestProperty.myComplexMap[firstEntry]"));
                    });

                    it("check .push() functionality", function() {
                        rootNode.resolvePath("myTestProperty.myReferenceArray").clear();
                        state.myTestProperty.myReferenceArray.push("myVector",
                            rootNode.resolvePath("myTestProperty.myF32Number"),
                            "/myBook");
                        expect(rootNode.resolvePath("myTestProperty.myReferenceArray[0]")).toEqual(
                            rootNode.resolvePath("myTestProperty.myVector"));
                        expect(rootNode.resolvePath("myTestProperty.myReferenceArray[1]")).toEqual(
                            rootNode.resolvePath("myTestProperty.myF32Number"));
                        expect(rootNode.resolvePath("myTestProperty.myReferenceArray[2]")).toEqual(
                            rootNode.resolvePath("myBook"));
                    });

                    it("check .reverse() functionality", function() {
                        const values = state.myTestProperty.myReferenceArray.getProperty().getValues();
                        state.myTestProperty.myReferenceArray.reverse();
                        expect(state.myTestProperty.myReferenceArray.getProperty().getValues().toString()).toEqual(
                            values.reverse().toString());
                    });

                    it("check .sort() functionality", function() {
                        // Primitive
                        rootNode.resolvePath("myTestProperty.myReferenceArray").setValues([
                            "myI32Array[0]",
                            "myI32Array[1]",
                            "myI32Array[2]",
                            "myI32Array[3]",
                            "myI32Array[4]",
                        ]);

                        state.myTestProperty.myReferenceArray.sort((a, b) => (b - a));
                        for (let i = 0; i < state.myTestProperty.myReferenceArray.length; ++i) {
                            expect(rootNode.resolvePath("myTestProperty.myReferenceArray").get(i)).toEqual(
                                rootNode.resolvePath("myTestProperty.myI32Array").get(
                                    state.myTestProperty.myReferenceArray.length - 1 - i));
                        }

                        // Non-Primitive
                        rootNode.resolvePath("myTestProperty.myReferenceArray").setValues([
                            "myComplexArray[0]",
                            "myComplexArray[1]",
                        ]);

                        state.myTestProperty.myReferenceArray.sort((a, b) => (b.x - a.x));
                        for (let i = 0; i < state.myTestProperty.myReferenceArray.length; ++i) {
                            expect(rootNode.resolvePath("myTestProperty.myReferenceArray")
                                .get(i).get("x").getValue()).toEqual(
                                    rootNode.resolvePath("myTestProperty.myComplexArray").get(
                                        state.myTestProperty.myReferenceArray.length - 1 - i).get("x").getValue());
                        }

                        // Mix and multi-hops
                        rootNode.resolvePath("myTestProperty.myReferenceArray").setValues([
                            "myComplexArray[1]",
                            "myMultiHopReference",
                            "myI32Array[0]",
                        ]);

                        state.myTestProperty.myReferenceArray.sort((a, b) => {
                            if (a.x) {
                                a = a.x;
                            }

                            if (b.x) {
                                b = b.x;
                            }

                            return (a - b);
                        });

                        expect(rootNode.resolvePath("myTestProperty.myReferenceArray")
                            .getValue(0)).toEqual("myI32Array[0]");
                        expect(rootNode.resolvePath("myTestProperty.myReferenceArray")
                            .getValue(1)).toEqual("myMultiHopReference");
                        expect(rootNode.resolvePath("myTestProperty.myReferenceArray")
                            .getValue(2)).toEqual("myComplexArray[1]");
                    });

                    it("check .splice() functionality", function() {
                        const removed = state.myTestProperty.myReferenceArray
                            .splice(0, 6, "myI32Array[0]", "myI32Array[1]");
                        expect(removed.length).toEqual(6);
                        expect(removed[0]).toEqual(rootNode.resolvePath("myTestProperty.myF32Number").getValue());
                        expect(removed[1]).toEqual(rootNode.resolvePath("myTestProperty.myF32Number").getValue());
                        expect(removed[2]).toEqual(rootNode.resolvePath("myTestProperty.myF32Number").getValue());

                        expect(removed[3].getProperty()).toEqual(rootNode.resolvePath("myTestProperty.myVector"));
                        expect(removed[4].getProperty()).toEqual(rootNode.resolvePath("myTestProperty.myVector"));
                        expect(removed[5].getProperty()).toEqual(rootNode.resolvePath("myTestProperty.myVector"));

                        expect(rootNode.resolvePath("myTestProperty.myReferenceArray").getLength()).toEqual(32);
                        expect(rootNode.resolvePath("myTestProperty.myReferenceArray[0]")).toEqual(0);
                        expect(rootNode.resolvePath("myTestProperty.myReferenceArray[1]")).toEqual(10);
                    });

                    it("check .shift() functionality", function() {
                        const first = state.myTestProperty.myReferenceArray.shift();
                        expect(first).toEqual(rootNode.resolvePath("myTestProperty.myF32Number").getValue());
                    });

                    it("check .swap() functionality", function() {
                        state.myTestProperty.myReferenceArray.swap(0, 3);
                        expect(rootNode.resolvePath("myTestProperty.myReferenceArray[0]")).toEqual(
                            rootNode.resolvePath("myTestProperty.myVector"));
                        expect(rootNode.resolvePath("myTestProperty.myReferenceArray[3]")).toEqual(
                            rootNode.resolvePath("myTestProperty.myF32Number"));
                    });

                    it("check .unshift() functionality", function() {
                        rootNode.resolvePath("myTestProperty.myReferenceArray").clear();
                        state.myTestProperty.myReferenceArray.unshift("myVector",
                            rootNode.resolvePath("myTestProperty.myF32Number"),
                            "/myBook",
                            "../myTestProperty");
                        expect(rootNode.resolvePath("myTestProperty.myReferenceArray[0]")).toEqual(
                            rootNode.resolvePath("myTestProperty.myVector"));
                        expect(rootNode.resolvePath("myTestProperty.myReferenceArray[1]")).toEqual(
                            rootNode.resolvePath("myTestProperty.myF32Number"));
                        expect(rootNode.resolvePath("myTestProperty.myReferenceArray[2]")).toEqual(
                            rootNode.resolvePath("myBook"));
                        expect(rootNode.resolvePath("myTestProperty.myReferenceArray[3]")).toEqual(
                            rootNode.resolvePath("myTestProperty"));
                    });

                    it("should throw if trying to set a property referenced via an absolute path " +
                        "if the ReferenceArray is not yet in the property tree", function() {
                            // Property not in property tree
                            const tempRefArray = PropertyProxy.proxify(PropertyFactory.create("Reference", "array", [
                                "/myTestProperty.myF32Number",
                            ]));
                            expect(() => { tempRefArray[0] = 100; }).toThrow();
                        });

                    it("should throw if trying to set invalid references", function() {
                        rootNode.resolvePath("myTestProperty.myReferenceArray").clear();
                        rootNode.resolvePath("myTestProperty.myReferenceArray").insert(0, "relativeInvalid");
                        rootNode.resolvePath("myTestProperty.myReferenceArray").insert(1, "/absoluteInvalid");

                        expect(() => { state.myTestProperty.myReferenceArray[0] = 100; }).toThrow("PropertyProxy-009");
                        expect(() => { state.myTestProperty.myReferenceArray[1] = 100; }).toThrow("PropertyProxy-009");
                    });
                });
            });

            describe("Map", function() {
                let refMapSum = 0;
                let refMap;

                beforeAll(function() {
                    refMap = rootNode.resolvePath("myTestProperty.myReferenceMap");
                    const refMapIds = refMap.getIds();
                    for (const id of refMapIds) {
                        const entry = refMap.get(id);
                        if (PropertyFactory.instanceOf(entry, "BaseProperty")) {
                            refMapSum += PropertyFactory.instanceOf(entry, "ContainerProperty") && entry.has("x")
                                ? entry.get("x").getValue()
                                : entry.getValue();
                        } else {
                            refMapSum += entry;
                        }
                    }
                });

                it("should be able to access the referenced properties", function() {
                    const rM = state.myTestProperty.myReferenceMap;

                    // myF32Number
                    expect(rM.get("a")).toEqual(3);
                    expect(rM.get("b")).toEqual(3);
                    expect(rM.get("c")).toEqual(3);

                    // myVector
                    expect(rM.get("d").x).toEqual(1);
                    expect(rM.get("d").y).toEqual(2);
                    expect(rM.get("e").x).toEqual(1);
                    expect(rM.get("e").y).toEqual(2);
                    expect(rM.get("f").x).toEqual(1);
                    expect(rM.get("f").y).toEqual(2);

                    // myI32Array[0]
                    expect(rM.get("g")).toEqual(0);
                    expect(rM.get("h")).toEqual(0);
                    expect(rM.get("i")).toEqual(0);

                    // myComplexArray[0]
                    expect(rM.get("j").x).toEqual(1);
                    expect(rM.get("j").y).toEqual(2);
                    expect(rM.get("k").x).toEqual(1);
                    expect(rM.get("k").y).toEqual(2);
                    expect(rM.get("l").x).toEqual(1);
                    expect(rM.get("l").y).toEqual(2);

                    // myMap[0]
                    expect(rM.get("m")).toEqual(1111);
                    expect(rM.get("n")).toEqual(1111);
                    expect(rM.get("o")).toEqual(1111);

                    // myComplexMap[0]
                    expect(rM.get("p").x).toEqual(10);
                    expect(rM.get("p").y).toEqual(20);
                    expect(rM.get("q").x).toEqual(10);
                    expect(rM.get("q").y).toEqual(20);
                    expect(rM.get("r").x).toEqual(10);
                    expect(rM.get("r").y).toEqual(20);
                });

                it("should be able to access the referenced properties in the presence of multi-hops", function() {
                    const rM = state.myTestProperty.myReferenceMap;

                    // myF32Number
                    expect(rM.get("aa")).toEqual(3);
                    expect(rM.get("bb")).toEqual(3);
                    expect(rM.get("cc")).toEqual(3);

                    // myVector
                    expect(rM.get("dd").x).toEqual(1);
                    expect(rM.get("dd").y).toEqual(2);
                    expect(rM.get("ee").x).toEqual(1);
                    expect(rM.get("ee").y).toEqual(2);
                    expect(rM.get("ff").x).toEqual(1);
                    expect(rM.get("ff").y).toEqual(2);

                    // myI32Array[0]
                    expect(rM.get("gg")).toEqual(0);
                    expect(rM.get("hh")).toEqual(0);
                    expect(rM.get("ii")).toEqual(0);

                    // myComplexArray[0]
                    expect(rM.get("jj").x).toEqual(1);
                    expect(rM.get("jj").y).toEqual(2);
                    expect(rM.get("kk").x).toEqual(1);
                    expect(rM.get("kk").y).toEqual(2);
                    expect(rM.get("ll").x).toEqual(1);
                    expect(rM.get("ll").y).toEqual(2);

                    // myMap[0]
                    expect(rM.get("mm")).toEqual(1111);
                    expect(rM.get("nn")).toEqual(1111);
                    expect(rM.get("oo")).toEqual(1111);

                    // myComplexMap[0]
                    expect(rM.get("pp").x).toEqual(10);
                    expect(rM.get("pp").y).toEqual(20);
                    expect(rM.get("qq").x).toEqual(10);
                    expect(rM.get("qq").y).toEqual(20);
                    expect(rM.get("rr").x).toEqual(10);
                    expect(rM.get("rr").y).toEqual(20);
                });

                it("should be able to access stored reference path strings via *", function() {
                    const rM = state.myTestProperty.myReferenceMap;
                    const refMapIds = refMap.getIds();

                    for (const id of refMapIds) {
                        expect(rM.get(`${id}*`)).toEqual(refMap.getValue(id));
                    }
                });

                it("check .entries() functionality", function() {
                    const entriesIterator = state.myTestProperty.myReferenceMap.entries();
                    let next;

                    // myF32Number
                    next = entriesIterator.next().value;
                    expect(next[0]).toEqual("a");
                    next = entriesIterator.next().value;
                    expect(next[0]).toEqual("b");
                    next = entriesIterator.next().value;
                    expect(next[0]).toEqual("c");

                    // myVector
                    next = entriesIterator.next().value;
                    expect(next[0]).toEqual("d");
                    next = entriesIterator.next().value;
                    expect(next[0]).toEqual("e");
                    next = entriesIterator.next().value;
                    expect(next[0]).toEqual("f");

                    // myI32Array[0]
                    next = entriesIterator.next().value;
                    expect(next[0]).toEqual("g");
                    next = entriesIterator.next().value;
                    expect(next[0]).toEqual("h");
                    next = entriesIterator.next().value;
                    expect(next[0]).toEqual("i");

                    // myComplexArray[0]
                    next = entriesIterator.next().value;
                    expect(next[0]).toEqual("j");
                    next = entriesIterator.next().value;
                    expect(next[0]).toEqual("k");
                    next = entriesIterator.next().value;
                    expect(next[0]).toEqual("l");

                    // myMap[0]
                    next = entriesIterator.next().value;
                    expect(next[0]).toEqual("m");
                    next = entriesIterator.next().value;
                    expect(next[0]).toEqual("n");
                    next = entriesIterator.next().value;
                    expect(next[0]).toEqual("o");

                    // myComplexMap[0]
                    next = entriesIterator.next().value;
                    expect(next[0]).toEqual("p");
                    next = entriesIterator.next().value;
                    expect(next[0]).toEqual("q");
                    next = entriesIterator.next().value;
                    expect(next[0]).toEqual("r");

                    next = entriesIterator.next();
                    let sum = 0;
                    while (next.done !== true) {
                        sum += next.value[1].x ? next.value[1].x : next.value[1];
                        next = entriesIterator.next();
                    }
                    sum += sum;
                    expect(sum).toEqual(refMapSum);
                });

                it("check .forEach() functionality", function() {
                    let sum = 0;
                    state.myTestProperty.myReferenceMap.forEach((el) => {
                        sum += el.x ? el.x : el;
                    });
                    expect(sum).toEqual(refMapSum);
                });

                it("check .values() functionality", function() {
                    const valuesIterator = state.myTestProperty.myReferenceMap.values();
                    let sum = 0;

                    let next = valuesIterator.next();
                    while (next.done !== true) {
                        sum += next.value.x ? next.value.x : next.value;
                        next = valuesIterator.next();
                    }
                    expect(sum).toEqual(refMapSum);
                });

                describe("Setting", function() {
                    const reset = () => {
                        rootNode.resolvePath("myTestProperty.myF32Number").setValue(3);
                        rootNode.resolvePath("myTestProperty.myVector").setValues({ x: 1, y: 2 });
                        rootNode.resolvePath("myTestProperty.myI32Array").set(0, 0);
                        rootNode.resolvePath("myTestProperty.myComplexArray").set(0, { x: 1, y: 2 });
                        rootNode.resolvePath("myTestProperty.myMap").set("firstNumber", 1111);
                        rootNode.resolvePath("myTestProperty.myComplexMap[firstEntry]").setValues({ x: 10, y: 20 });
                        rootNode.resolvePath("myTestProperty.myReferenceMap").setValues({
                            a: "myF32Number",
                            b: "../myTestProperty.myF32Number",
                            c: "/myTestProperty.myF32Number",

                            d: "myVector",
                            e: "../myTestProperty.myVector",
                            f: "/myTestProperty.myVector",

                            g: "myI32Array[0]",
                            h: "../myTestProperty.myI32Array[0]",
                            i: "/myTestProperty.myI32Array[0]",

                            j: "myComplexArray[0]",
                            k: "/myTestProperty.myComplexArray[0]",
                            l: "../myTestProperty.myComplexArray[0]",

                            m: "myMap[firstNumber]",
                            n: "../myTestProperty.myMap[firstNumber]",
                            o: "/myTestProperty.myMap[firstNumber]",

                            p: "myComplexMap[firstEntry]",
                            q: "../myTestProperty.myComplexMap[firstEntry]",
                            r: "/myTestProperty.myComplexMap[firstEntry]",

                            aa: "myReferenceMap[a]",
                            bb: "myReferenceMap[b]",
                            cc: "myReferenceMap[c]",
                            dd: "myReferenceMap[d]",
                            ee: "myReferenceMap[e]",
                            ff: "myReferenceMap[f]",
                            gg: "myReferenceMap[g]",
                            hh: "myReferenceMap[h]",
                            ii: "myReferenceMap[i]",
                            jj: "myReferenceMap[j]",
                            kk: "myReferenceMap[k]",
                            ll: "myReferenceMap[l]",
                            mm: "myReferenceMap[m]",
                            nn: "myReferenceMap[n]",
                            oo: "myReferenceMap[o]",
                            pp: "myReferenceMap[p]",
                            qq: "myReferenceMap[q]",
                            rr: "myReferenceMap[r]",
                        });
                    };

                    beforeEach(function() {
                        reset();
                    });

                    it("should be able to change the referenced properties", function() {
                        const rM = state.myTestProperty.myReferenceMap;

                        rM.set("a", 4);
                        expect(rootNode.resolvePath("myTestProperty.myF32Number").getValue()).toEqual(4);
                        rM.set("b", 5);
                        expect(rootNode.resolvePath("myTestProperty.myF32Number").getValue()).toEqual(5);
                        rM.set("c", 6);
                        expect(rootNode.resolvePath("myTestProperty.myF32Number").getValue()).toEqual(6);

                        rM.set("d", { x: 3, y: 4 });
                        expect(rootNode.resolvePath("myTestProperty.myVector.x").getValue()).toEqual(3);
                        expect(rootNode.resolvePath("myTestProperty.myVector.y").getValue()).toEqual(4);
                        rM.set("e", { x: 5, y: 6 });
                        expect(rootNode.resolvePath("myTestProperty.myVector.x").getValue()).toEqual(5);
                        expect(rootNode.resolvePath("myTestProperty.myVector.y").getValue()).toEqual(6);
                        rM.set("f", { x: 7, y: 8 });
                        expect(rootNode.resolvePath("myTestProperty.myVector.x").getValue()).toEqual(7);
                        expect(rootNode.resolvePath("myTestProperty.myVector.y").getValue()).toEqual(8);

                        rM.set("g", 1);
                        expect(rootNode.resolvePath("myTestProperty.myI32Array[0]")).toEqual(1);
                        rM.set("h", 2);
                        expect(rootNode.resolvePath("myTestProperty.myI32Array[0]")).toEqual(2);
                        rM.set("i", 3);
                        expect(rootNode.resolvePath("myTestProperty.myI32Array[0]")).toEqual(3);

                        rM.set("j", { x: 3, y: 4 });
                        expect(rootNode.resolvePath("myTestProperty.myComplexArray[0].x").getValue()).toEqual(3);
                        expect(rootNode.resolvePath("myTestProperty.myComplexArray[0].y").getValue()).toEqual(4);
                        rM.set("k", { x: 5, y: 6 });
                        expect(rootNode.resolvePath("myTestProperty.myComplexArray[0].x").getValue()).toEqual(5);
                        expect(rootNode.resolvePath("myTestProperty.myComplexArray[0].y").getValue()).toEqual(6);
                        rM.set("l", { x: 7, y: 8 });
                        expect(rootNode.resolvePath("myTestProperty.myComplexArray[0].x").getValue()).toEqual(7);
                        expect(rootNode.resolvePath("myTestProperty.myComplexArray[0].y").getValue()).toEqual(8);

                        rM.set("m", 1);
                        expect(rootNode.resolvePath("myTestProperty.myMap[firstNumber]")).toEqual(1);
                        rM.set("n", 2);
                        expect(rootNode.resolvePath("myTestProperty.myMap[firstNumber]")).toEqual(2);
                        rM.set("o", 3);
                        expect(rootNode.resolvePath("myTestProperty.myMap[firstNumber]")).toEqual(3);

                        rM.set("p", { x: 3, y: 4 });
                        expect(rootNode.resolvePath("myTestProperty.myComplexMap[firstEntry].x").getValue()).toEqual(3);
                        expect(rootNode.resolvePath("myTestProperty.myComplexMap[firstEntry].y").getValue()).toEqual(4);
                        rM.set("q", { x: 5, y: 6 });
                        expect(rootNode.resolvePath("myTestProperty.myComplexMap[firstEntry].x").getValue()).toEqual(5);
                        expect(rootNode.resolvePath("myTestProperty.myComplexMap[firstEntry].y").getValue()).toEqual(6);
                        rM.set("r", { x: 7, y: 8 });
                        expect(rootNode.resolvePath("myTestProperty.myComplexMap[firstEntry].x").getValue()).toEqual(7);
                        expect(rootNode.resolvePath("myTestProperty.myComplexMap[firstEntry].y").getValue()).toEqual(8);
                    });

                    it("should be able to change the referenced properties in the presence of multi-hops", function() {
                        const rM = state.myTestProperty.myReferenceMap;

                        rM.set("aa", 4);
                        expect(rootNode.resolvePath("myTestProperty.myF32Number").getValue()).toEqual(4);
                        rM.set("bb", 5);
                        expect(rootNode.resolvePath("myTestProperty.myF32Number").getValue()).toEqual(5);
                        rM.set("cc", 6);
                        expect(rootNode.resolvePath("myTestProperty.myF32Number").getValue()).toEqual(6);

                        rM.set("dd", { x: 3, y: 4 });
                        expect(rootNode.resolvePath("myTestProperty.myVector.x").getValue()).toEqual(3);
                        expect(rootNode.resolvePath("myTestProperty.myVector.y").getValue()).toEqual(4);
                        rM.set("ee", { x: 5, y: 6 });
                        expect(rootNode.resolvePath("myTestProperty.myVector.x").getValue()).toEqual(5);
                        expect(rootNode.resolvePath("myTestProperty.myVector.y").getValue()).toEqual(6);
                        rM.set("ff", { x: 7, y: 8 });
                        expect(rootNode.resolvePath("myTestProperty.myVector.x").getValue()).toEqual(7);
                        expect(rootNode.resolvePath("myTestProperty.myVector.y").getValue()).toEqual(8);

                        rM.set("gg", 1);
                        expect(rootNode.resolvePath("myTestProperty.myI32Array[0]")).toEqual(1);
                        rM.set("hh", 2);
                        expect(rootNode.resolvePath("myTestProperty.myI32Array[0]")).toEqual(2);
                        rM.set("ii", 3);
                        expect(rootNode.resolvePath("myTestProperty.myI32Array[0]")).toEqual(3);

                        rM.set("jj", { x: 3, y: 4 });
                        expect(rootNode.resolvePath("myTestProperty.myComplexArray[0].x").getValue()).toEqual(3);
                        expect(rootNode.resolvePath("myTestProperty.myComplexArray[0].y").getValue()).toEqual(4);
                        rM.set("kk", { x: 5, y: 6 });
                        expect(rootNode.resolvePath("myTestProperty.myComplexArray[0].x").getValue()).toEqual(5);
                        expect(rootNode.resolvePath("myTestProperty.myComplexArray[0].y").getValue()).toEqual(6);
                        rM.set("ll", { x: 7, y: 8 });
                        expect(rootNode.resolvePath("myTestProperty.myComplexArray[0].x").getValue()).toEqual(7);
                        expect(rootNode.resolvePath("myTestProperty.myComplexArray[0].y").getValue()).toEqual(8);

                        rM.set("mm", 1);
                        expect(rootNode.resolvePath("myTestProperty.myMap[firstNumber]")).toEqual(1);
                        rM.set("nn", 2);
                        expect(rootNode.resolvePath("myTestProperty.myMap[firstNumber]")).toEqual(2);
                        rM.set("oo", 3);
                        expect(rootNode.resolvePath("myTestProperty.myMap[firstNumber]")).toEqual(3);

                        rM.set("pp", { x: 3, y: 4 });
                        expect(rootNode.resolvePath("myTestProperty.myComplexMap[firstEntry].x").getValue()).toEqual(3);
                        expect(rootNode.resolvePath("myTestProperty.myComplexMap[firstEntry].y").getValue()).toEqual(4);
                        rM.set("qq", { x: 5, y: 6 });
                        expect(rootNode.resolvePath("myTestProperty.myComplexMap[firstEntry].x").getValue()).toEqual(5);
                        expect(rootNode.resolvePath("myTestProperty.myComplexMap[firstEntry].y").getValue()).toEqual(6);
                        rM.set("rr", { x: 7, y: 8 });
                        expect(rootNode.resolvePath("myTestProperty.myComplexMap[firstEntry].x").getValue()).toEqual(7);
                        expect(rootNode.resolvePath("myTestProperty.myComplexMap[firstEntry].y").getValue()).toEqual(8);
                    });

                    it("should be able to assign another path/property to reference another property", function() {
                        const rM = state.myTestProperty.myReferenceMap;

                        // Relative
                        rM.set("a*", "myVector");
                        expect(rootNode.resolvePath("myTestProperty.myReferenceMap[a]")).toEqual(
                            rootNode.resolvePath("myTestProperty.myVector"));

                        // Property
                        rM.set("a*", rootNode.resolvePath("myTestProperty.myF32Number"));
                        expect(rootNode.resolvePath("myTestProperty.myReferenceMap[a]")).toEqual(
                            rootNode.resolvePath("myTestProperty.myF32Number"));

                        // Absolute Path
                        rM.set("a*", "/myTestProperty.myVector");
                        expect(rootNode.resolvePath("myTestProperty.myReferenceMap[a]")).toEqual(
                            rootNode.resolvePath("myTestProperty.myVector"));
                    });

                    it("should be able to assign a new iterable", function() {
                        state.myTestProperty.myReferenceMap = [
                            ["a", "myVector"],
                            ["b", rootNode.resolvePath("myTestProperty.myF32Number")],
                            ["c", "/myBook"],
                        ];
                        expect(rootNode.resolvePath("myTestProperty.myReferenceMap[a]")).toEqual(
                            rootNode.resolvePath("myTestProperty.myVector"));
                        expect(rootNode.resolvePath("myTestProperty.myReferenceMap[b]")).toEqual(
                            rootNode.resolvePath("myTestProperty.myF32Number"));
                        expect(rootNode.resolvePath("myTestProperty.myReferenceMap[c]")).toEqual(
                            rootNode.resolvePath("myBook"));
                    });
                });
            });
        });

        describe("Float32", function() {
            it("Reading Float32 number", function() {
                expect(state.myTestProperty.myF32Number).toEqual(3);
            });

            it("Setting Float32 number", function() {
                state.myTestProperty.myF32Number = 5;
                expect(state.myTestProperty.myF32Number).toEqual(5);
                expect(rootNode.get("myTestProperty").get("myF32Number").getValue()).toEqual(5);

                // Property
                state.myTestProperty.myF32Number = PropertyFactory.create("Float32", "single", 10);
                expect(rootNode.resolvePath("myTestProperty.myF32Number").getValue()).toEqual(10);

                state.myTestProperty.myF32Number = PropertyProxy.proxify(
                    PropertyFactory.create("Float32", "single", 11));
                expect(rootNode.resolvePath("myTestProperty.myF32Number").getValue()).toEqual(11);

                expect(() => { state.myTestProperty.myF32Number = [1, 2, 3]; }).toThrow("PropertyProxy-007");
            });

            it("Obtain the property via the parent", function() {
                expect(state.myTestProperty.getProperty("myF32Number")).toEqual(
                    rootNode.resolvePath("myTestProperty.myF32Number"));
            });
        });

        describe("Enum/EnumArray", function() {
            it("accessing", function() {
                expect(state.myTestProperty.myEnumCases.myEnum).toEqual(1);
                expect(state.myTestProperty.myEnumCases["myEnum^"]).toEqual("uno");
                expect(state.myTestProperty.myEnumCases.myEnumArray[0]).toEqual(1);
                expect(state.myTestProperty.myEnumCases.myEnumArray["0^"]).toEqual("uno");

                expect(state.myTestProperty.myEnumCases.refToEnum).toEqual(1);
                expect(state.myTestProperty.myEnumCases["refToEnum^"]).toEqual("uno");
                expect(state.myTestProperty.myEnumCases.refToEnumArrayEntry).toEqual(2);
                expect(state.myTestProperty.myEnumCases["refToEnumArrayEntry^"]).toEqual("dos");

                // Ref Array
                // ref to enum
                expect(state.myTestProperty.myEnumCases.refArrayToEnum[0]).toEqual(1);
                expect(state.myTestProperty.myEnumCases.refArrayToEnum["0^"]).toEqual("uno");
                expect(state.myTestProperty.myEnumCases.refArrayToEnum[1]).toEqual(1);
                expect(state.myTestProperty.myEnumCases.refArrayToEnum["1^"]).toEqual("uno");

                // ref to entry of enumArray
                expect(state.myTestProperty.myEnumCases.refArrayToEnum[2]).toEqual(1);
                expect(state.myTestProperty.myEnumCases.refArrayToEnum["2^"]).toEqual("uno");
                expect(state.myTestProperty.myEnumCases.refArrayToEnum[3]).toEqual(1);
                expect(state.myTestProperty.myEnumCases.refArrayToEnum["3^"]).toEqual("uno");

                // ref to ref to enum
                expect(state.myTestProperty.myEnumCases.refArrayToEnum[4]).toEqual(1);
                expect(state.myTestProperty.myEnumCases.refArrayToEnum["4^"]).toEqual("uno");
                expect(state.myTestProperty.myEnumCases.refArrayToEnum[5]).toEqual(1);
                expect(state.myTestProperty.myEnumCases.refArrayToEnum["5^"]).toEqual("uno");

                // ref to ref to entry of enumArray
                expect(state.myTestProperty.myEnumCases.refArrayToEnum[6]).toEqual(2);
                expect(state.myTestProperty.myEnumCases.refArrayToEnum["6^"]).toEqual("dos");
                expect(state.myTestProperty.myEnumCases.refArrayToEnum[7]).toEqual(2);
                expect(state.myTestProperty.myEnumCases.refArrayToEnum["7^"]).toEqual("dos");

                // Ref Map
                // ref to enum
                expect(state.myTestProperty.myEnumCases.refMapToEnum.get("a")).toEqual(1);
                expect(state.myTestProperty.myEnumCases.refMapToEnum.get("a^")).toEqual("uno");
                expect(state.myTestProperty.myEnumCases.refMapToEnum.get("b")).toEqual(1);
                expect(state.myTestProperty.myEnumCases.refMapToEnum.get("b^")).toEqual("uno");

                // ref to entry of enumArray
                expect(state.myTestProperty.myEnumCases.refMapToEnum.get("c")).toEqual(1);
                expect(state.myTestProperty.myEnumCases.refMapToEnum.get("c^")).toEqual("uno");
                expect(state.myTestProperty.myEnumCases.refMapToEnum.get("d")).toEqual(1);
                expect(state.myTestProperty.myEnumCases.refMapToEnum.get("d^")).toEqual("uno");

                // ref to ref to enum
                expect(state.myTestProperty.myEnumCases.refMapToEnum.get("e")).toEqual(1);
                expect(state.myTestProperty.myEnumCases.refMapToEnum.get("e^")).toEqual("uno");
                expect(state.myTestProperty.myEnumCases.refMapToEnum.get("f")).toEqual(1);
                expect(state.myTestProperty.myEnumCases.refMapToEnum.get("f^")).toEqual("uno");

                // ref to ref to entry of enumArray
                expect(state.myTestProperty.myEnumCases.refMapToEnum.get("g")).toEqual(2);
                expect(state.myTestProperty.myEnumCases.refMapToEnum.get("g^")).toEqual("dos");
                expect(state.myTestProperty.myEnumCases.refMapToEnum.get("h")).toEqual(2);
                expect(state.myTestProperty.myEnumCases.refMapToEnum.get("h^")).toEqual("dos");
            });

            it("setting", function() {
                state.myTestProperty.myEnumCases.myEnum = 2;
                expect(rootNode.resolvePath("myTestProperty.myEnumCases.myEnum").getValue()).toEqual(2);
                expect(rootNode.resolvePath("myTestProperty.myEnumCases.myEnum").getEnumString()).toEqual("dos");

                state.myTestProperty.myEnumCases.myEnum = "tres";
                expect(rootNode.resolvePath("myTestProperty.myEnumCases.myEnum").getValue()).toEqual(3);
                expect(rootNode.resolvePath("myTestProperty.myEnumCases.myEnum").getEnumString()).toEqual("tres");

                expect(() => { state.myTestProperty.myEnumCases.myEnum = "notAValidEnumString"; }).toThrow(
                );
                expect(() => { state.myTestProperty.myEnumCases.myEnum = "100"; }).toThrow();

                state.myTestProperty.myEnumCases.myEnumArray = ["dos", 1];
                expect(rootNode.resolvePath("myTestProperty.myEnumCases.myEnumArray").get(0)).toEqual(2);
                expect(rootNode.resolvePath("myTestProperty.myEnumCases.myEnumArray").get(1)).toEqual(1);

                expect(state.myTestProperty.myEnumCases.myEnumArray.pop()).toEqual(1);
                expect(state.myTestProperty.myEnumCases.myEnumArray.shift()).toEqual(2);
                state.myTestProperty.myEnumCases.myEnumArray.push(2);
                expect(rootNode.resolvePath("myTestProperty.myEnumCases.myEnumArray").get(0)).toEqual(2);
                state.myTestProperty.myEnumCases.myEnumArray.unshift("uno");
                expect(rootNode.resolvePath("myTestProperty.myEnumCases.myEnumArray").get(0)).toEqual(1);
            });
        });

        describe("(U)int64/(U)int64Array/(U)int64Map", function() {
            it("accessing", function() {
                const uint64Value = rootNode.resolvePath("myTestProperty.myUint64Int64Cases.myUint64").getValue();
                const valueOfUint64ArrayAtZero =
                    rootNode.resolvePath("myTestProperty.myUint64Int64Cases.myUint64Array[0]");
                const valueOfInt64MapAtA = rootNode.resolvePath("myTestProperty.myUint64Int64Cases.myInt64Map[a]");

                const stringVal = "4294967296";

                expect(state.myTestProperty.myUint64Int64Cases.myUint64).toEqual(uint64Value);
                expect(state.myTestProperty.myUint64Int64Cases["myUint64^"]).toEqual(stringVal);
                expect(state.myTestProperty.myUint64Int64Cases.myUint64Array[0]).toEqual(valueOfUint64ArrayAtZero);
                expect(state.myTestProperty.myUint64Int64Cases.myUint64Array["0^"]).toEqual(stringVal);
                expect(state.myTestProperty.myUint64Int64Cases.myInt64Map.get("a")).toEqual(valueOfInt64MapAtA);
                expect(state.myTestProperty.myUint64Int64Cases.myInt64Map.get("a^")).toEqual(stringVal);

                expect(state.myTestProperty.myUint64Int64Cases.refToUint64).toEqual(uint64Value);
                expect(state.myTestProperty.myUint64Int64Cases["refToUint64^"]).toEqual(stringVal);
                expect(state.myTestProperty.myUint64Int64Cases.refToUint64ArrayEntry).toEqual(valueOfUint64ArrayAtZero);
                expect(state.myTestProperty.myUint64Int64Cases["refToUint64ArrayEntry^"]).toEqual(stringVal);
                expect(state.myTestProperty.myUint64Int64Cases.refToInt64MapEntry).toEqual(valueOfInt64MapAtA);
                expect(state.myTestProperty.myUint64Int64Cases["refToInt64MapEntry^"]).toEqual(stringVal);

                // Ref Array
                // ref to Uint64
                expect(state.myTestProperty.myUint64Int64Cases.refArrayToUint64Int64[0]).toEqual(uint64Value);
                expect(state.myTestProperty.myUint64Int64Cases.refArrayToUint64Int64["0^"]).toEqual(stringVal);
                expect(state.myTestProperty.myUint64Int64Cases.refArrayToUint64Int64[1]).toEqual(uint64Value);
                expect(state.myTestProperty.myUint64Int64Cases.refArrayToUint64Int64["1^"]).toEqual(stringVal);

                // ref to entry of Uint64Array
                expect(state.myTestProperty.myUint64Int64Cases.refArrayToUint64Int64[2])
                    .toEqual(valueOfUint64ArrayAtZero);
                expect(state.myTestProperty.myUint64Int64Cases.refArrayToUint64Int64["2^"]).toEqual(stringVal);
                expect(state.myTestProperty.myUint64Int64Cases.refArrayToUint64Int64[3])
                    .toEqual(valueOfUint64ArrayAtZero);
                expect(state.myTestProperty.myUint64Int64Cases.refArrayToUint64Int64["3^"]).toEqual(stringVal);

                // ref to entry of Int64Map
                expect(state.myTestProperty.myUint64Int64Cases.refArrayToUint64Int64[4]).toEqual(valueOfInt64MapAtA);
                expect(state.myTestProperty.myUint64Int64Cases.refArrayToUint64Int64["4^"]).toEqual(stringVal);
                expect(state.myTestProperty.myUint64Int64Cases.refArrayToUint64Int64[5]).toEqual(valueOfInt64MapAtA);
                expect(state.myTestProperty.myUint64Int64Cases.refArrayToUint64Int64["5^"]).toEqual(stringVal);

                // ref to ref to Uint64
                expect(state.myTestProperty.myUint64Int64Cases.refArrayToUint64Int64[6]).toEqual(uint64Value);
                expect(state.myTestProperty.myUint64Int64Cases.refArrayToUint64Int64["6^"]).toEqual(stringVal);
                expect(state.myTestProperty.myUint64Int64Cases.refArrayToUint64Int64[7]).toEqual(uint64Value);
                expect(state.myTestProperty.myUint64Int64Cases.refArrayToUint64Int64["7^"]).toEqual(stringVal);

                // ref to ref to entry of Uint64Array
                expect(state.myTestProperty.myUint64Int64Cases.refArrayToUint64Int64[8])
                    .toEqual(valueOfUint64ArrayAtZero);
                expect(state.myTestProperty.myUint64Int64Cases.refArrayToUint64Int64["8^"]).toEqual(stringVal);
                expect(state.myTestProperty.myUint64Int64Cases.refArrayToUint64Int64[9])
                    .toEqual(valueOfUint64ArrayAtZero);
                expect(state.myTestProperty.myUint64Int64Cases.refArrayToUint64Int64["9^"]).toEqual(stringVal);

                // ref to ref to entry of Int64Map
                expect(state.myTestProperty.myUint64Int64Cases.refArrayToUint64Int64[10]).toEqual(valueOfInt64MapAtA);
                expect(state.myTestProperty.myUint64Int64Cases.refArrayToUint64Int64["10^"]).toEqual(stringVal);
                expect(state.myTestProperty.myUint64Int64Cases.refArrayToUint64Int64[11]).toEqual(valueOfInt64MapAtA);
                expect(state.myTestProperty.myUint64Int64Cases.refArrayToUint64Int64["11^"]).toEqual(stringVal);

                // Ref Map
                // ref to Uint64
                expect(state.myTestProperty.myUint64Int64Cases.refMapToUint64Int64.get("a")).toEqual(uint64Value);
                expect(state.myTestProperty.myUint64Int64Cases.refMapToUint64Int64.get("a^")).toEqual(stringVal);
                expect(state.myTestProperty.myUint64Int64Cases.refMapToUint64Int64.get("b")).toEqual(uint64Value);
                expect(state.myTestProperty.myUint64Int64Cases.refMapToUint64Int64.get("b^")).toEqual(stringVal);

                // ref to entry of Uint64Array
                expect(state.myTestProperty.myUint64Int64Cases.refMapToUint64Int64
                    .get("c")).toEqual(valueOfUint64ArrayAtZero);
                expect(state.myTestProperty.myUint64Int64Cases.refMapToUint64Int64.get("c^")).toEqual(stringVal);
                expect(state.myTestProperty.myUint64Int64Cases.refMapToUint64Int64
                    .get("d")).toEqual(valueOfUint64ArrayAtZero);
                expect(state.myTestProperty.myUint64Int64Cases.refMapToUint64Int64.get("d^")).toEqual(stringVal);

                // ref to entry of Int64Map
                expect(state.myTestProperty.myUint64Int64Cases.refMapToUint64Int64
                    .get("e")).toEqual(valueOfInt64MapAtA);
                expect(state.myTestProperty.myUint64Int64Cases.refMapToUint64Int64.get("e^")).toEqual(stringVal);
                expect(state.myTestProperty.myUint64Int64Cases.refMapToUint64Int64
                    .get("f")).toEqual(valueOfInt64MapAtA);
                expect(state.myTestProperty.myUint64Int64Cases.refMapToUint64Int64.get("f^")).toEqual(stringVal);

                // ref to ref to Uint64
                expect(state.myTestProperty.myUint64Int64Cases.refMapToUint64Int64.get("g")).toEqual(uint64Value);
                expect(state.myTestProperty.myUint64Int64Cases.refMapToUint64Int64.get("g^")).toEqual(stringVal);
                expect(state.myTestProperty.myUint64Int64Cases.refMapToUint64Int64.get("h")).toEqual(uint64Value);
                expect(state.myTestProperty.myUint64Int64Cases.refMapToUint64Int64.get("h^")).toEqual(stringVal);

                // ref to ref to entry of Uint64Array
                expect(state.myTestProperty.myUint64Int64Cases.refMapToUint64Int64
                    .get("i")).toEqual(valueOfUint64ArrayAtZero);
                expect(state.myTestProperty.myUint64Int64Cases.refMapToUint64Int64.get("i^")).toEqual(stringVal);
                expect(state.myTestProperty.myUint64Int64Cases.refMapToUint64Int64
                    .get("j")).toEqual(valueOfUint64ArrayAtZero);
                expect(state.myTestProperty.myUint64Int64Cases.refMapToUint64Int64.get("j^")).toEqual(stringVal);

                // ref to ref to entry of Int64Map
                expect(state.myTestProperty.myUint64Int64Cases.refMapToUint64Int64
                    .get("k")).toEqual(valueOfInt64MapAtA);
                expect(state.myTestProperty.myUint64Int64Cases.refMapToUint64Int64.get("k^")).toEqual(stringVal);
                expect(state.myTestProperty.myUint64Int64Cases.refMapToUint64Int64
                    .get("l")).toEqual(valueOfInt64MapAtA);
                expect(state.myTestProperty.myUint64Int64Cases.refMapToUint64Int64.get("l^")).toEqual(stringVal);
            });

            it("setting", function() {
                state.myTestProperty.myUint64Int64Cases.myUint64 = 1024;
                expect(
                    rootNode.resolvePath("myTestProperty.myUint64Int64Cases.myUint64").getValue().getValueLow(),
                ).toEqual(1024);
                state.myTestProperty.myUint64Int64Cases.myUint64 = "4294967296";
                expect(
                    rootNode.resolvePath("myTestProperty.myUint64Int64Cases.myUint64").getValue().getValueHigh(),
                ).toEqual(1);

                // state.myTestProperty.myUint64Int64Cases.myEnumArray = ['dos', 1];
                // rootNode.resolvePath('myTestProperty.myUint64Int64Cases.myEnumArray').get(0).should.equal(2);
                // rootNode.resolvePath('myTestProperty.myUint64Int64Cases.myEnumArray').get(1).should.equal(1);

                // state.myTestProperty.myUint64Int64Cases.myEnumArray.pop().should.equal(1);
                // state.myTestProperty.myUint64Int64Cases.myEnumArray.shift().should.equal(2);
                // state.myTestProperty.myUint64Int64Cases.myEnumArray.push(2);
                // rootNode.resolvePath('myTestProperty.myUint64Int64Cases.myEnumArray').get(0).should.equal(2);
                // state.myTestProperty.myUint64Int64Cases.myEnumArray.unshift('uno');
                // rootNode.resolvePath('myTestProperty.myUint64Int64Cases.myEnumArray').get(0).should.equal(1);
            });
        });

        describe("Simple non primitive type (Vector)", function() {
            it("Reading", function() {
                expect(state.myTestProperty.myVector.x).toEqual(1);
                expect(state.myTestProperty.myVector.y).toEqual(2);
            });

            it("Setting", function() {
                state.myTestProperty.myVector = { x: 3, y: 4 };
                expect(rootNode.get("myTestProperty").get("myVector").get("x").getValue()).toEqual(3);
                expect(rootNode.get("myTestProperty").get("myVector").get("y").getValue()).toEqual(4);

                // Property
                state.myTestProperty.myVector = PropertyFactory.create(vector2DTemplate.typeid,
                    "single", { x: 5, y: 6 });
                expect(rootNode.get("myTestProperty").get("myVector").get("x").getValue()).toEqual(5);
                expect(rootNode.get("myTestProperty").get("myVector").get("y").getValue()).toEqual(6);

                state.myTestProperty.myVector = PropertyProxy.proxify(
                    PropertyFactory.create(vector2DTemplate.typeid, "single", { x: 7, y: 8 }));
                expect(rootNode.get("myTestProperty").get("myVector").get("x").getValue()).toEqual(7);
                expect(rootNode.get("myTestProperty").get("myVector").get("y").getValue()).toEqual(8);

                expect(() => {
                    state.myTestProperty.myF32Number =
                        [{ x: 1, y: 2 }];
                }).toThrow("PropertyProxy-007");
            });
        });

        describe("Array (with primitive type entries)", function() {
            describe("Int32 array", function() {
                it("Reading from Array by directly accessing via indices", function() {
                    expect(state.myTestProperty.myI32Array[0]).toEqual(0);
                    expect(state.myTestProperty.myI32Array[1]).toEqual(10);
                    expect(state.myTestProperty.myI32Array[2]).toEqual(20);
                });

                it("Reading array length using .length", function() {
                    expect(typeof (state.myTestProperty.myI32Array.length)).toEqual("number");
                    expect(
                        state.myTestProperty.myI32Array.length,
                    ).toEqual(rootNode.get("myTestProperty").get("myI32Array").getLength());
                });

                it("Looping through the array indices using a for loop", function() {
                    const testArray = state.myTestProperty.myI32Array;
                    const tempArray: any[] = [];
                    // The array is defined as [0,10,20,30,...]
                    // eslint-disable-next-line @typescript-eslint/prefer-for-of
                    for (let i = 0; i < testArray.length; i++) {
                        tempArray.push(testArray[i]);
                    }
                    expect(tempArray[0]).toEqual(testArray[0]);
                    expect(tempArray[1]).toEqual(testArray[1]);
                    expect(tempArray[2]).toEqual(testArray[2]);
                    expect(tempArray[3]).toEqual(testArray[3]);
                });

                it("Looping through the array entries using a for-of loop", function() {
                    const testArray = state.myTestProperty.myI32Array;
                    // The array is defined as [0,10,20,30,...]
                    const tempArray: any[] = [];
                    for (const entry of testArray) {
                        tempArray.push(entry);
                    }
                    expect(tempArray[0]).toEqual(0);
                    expect(tempArray[1]).toEqual(10);
                    expect(tempArray[2]).toEqual(20);
                    expect(tempArray[3]).toEqual(30);
                    expect(tempArray[4]).toEqual(40);
                });

                it("Looping through the array indices using a for-in loop", function() {
                    const testArray = state.myTestProperty.myI32Array;
                    // The array is defined as [0,1,2,3,...]
                    const tempArray: string[] = [];
                    // eslint-disable-next-line no-restricted-syntax
                    for (const key in testArray) {  // eslint-disable-line guard-for-in
                        tempArray.push(key);
                    }
                    expect(tempArray.length).toEqual(testArray.length);
                    expect(tempArray[0]).toEqual("0");
                    expect(tempArray[1]).toEqual("1");
                    expect(tempArray[2]).toEqual("2");
                    expect(tempArray[3]).toEqual("3");
                    expect(tempArray[4]).toEqual("4");
                });

                it("Proxy on array property should have a type of JS array", function() {
                    const testArray = state.myTestProperty.myI32Array;
                    expect(testArray instanceof Array).toEqual(true);
                    expect(Array.isArray(testArray)).toEqual(true);
                });

                it("check .concat() functionality", function() {
                    const concat = state.myTestProperty.myI32Array
                        .concat(["a", "b", "c"], state.myTestProperty.myI32Array);
                    expect(concat.toString()).toEqual("0,10,20,30,40,a,b,c,0,10,20,30,40");
                });

                it("check .entries() functionality", function() {
                    const iterator = state.myTestProperty.myI32Array.entries();
                    expect(iterator.next().value.toString()).toEqual("0,0");
                    expect(iterator.next().value.toString()).toEqual("1,10");
                    expect(iterator.next().value.toString()).toEqual("2,20");
                    expect(iterator.next().value.toString()).toEqual("3,30");
                    expect(iterator.next().value.toString()).toEqual("4,40");
                    expect(iterator.next().done).toEqual(true);
                });

                it("check .every() functionality", function() {
                    expect(state.myTestProperty.myI32Array.every((element) => (element < 50))).toEqual(true);
                    expect(state.myTestProperty.myI32Array.every((element) => (element < 20))).toEqual(false);
                });

                it("check .filter() functionality", function() {
                    const filtered = state.myTestProperty.myI32Array.filter((element) => (element < 20));
                    expect(filtered.length).toEqual(2);
                    expect(Object.getPrototypeOf(filtered)).toEqual(Object.getPrototypeOf([]));
                });

                it("check .find() functionality", function() {
                    expect(state.myTestProperty.myI32Array
                        .find((element) => (element < 15 && element > 5))).toEqual(10);
                });

                it("check .findIndex() functionality", function() {
                    expect(state.myTestProperty.myI32Array
                        .findIndex((element) => (element < 15 && element > 5))).toEqual(1);
                });

                it("check .foreach() functionality", function() {
                    const testArray = state.myTestProperty.myI32Array;
                    const tempArray: number[] = [];
                    const squareIt = function(element) {
                        tempArray.push(element * element);
                    };
                    testArray.forEach(squareIt);

                    expect(tempArray[0]).toEqual(testArray[0] * testArray[0]);
                    expect(tempArray[1]).toEqual(testArray[1] * testArray[1]);
                    expect(tempArray[2]).toEqual(testArray[2] * testArray[2]);
                    expect(tempArray[3]).toEqual(testArray[3] * testArray[3]);
                    expect(tempArray[4]).toEqual(testArray[4] * testArray[4]);
                });

                it("check .includes() functionality", function() {
                    expect(state.myTestProperty.myI32Array.includes(20)).toEqual(true);
                    expect(state.myTestProperty.myI32Array.includes(60)).toEqual(false);
                });

                it("check .indexOf() functionality", function() {
                    const testArray = state.myTestProperty.myI32Array;
                    expect(testArray.indexOf(0)).toEqual(0);
                    expect(testArray.indexOf(10)).toEqual(1);
                    expect(testArray.indexOf(20)).toEqual(2);
                    expect(testArray.indexOf(30)).toEqual(3);
                });

                it("check .join() functionality", function() {
                    expect(state.myTestProperty.myI32Array.join(" ")).toEqual("0 10 20 30 40");
                });

                it("check .keys() functionality", function() {
                    const iterator = state.myTestProperty.myI32Array.keys();
                    expect(iterator.next().value).toEqual(0);
                    expect(iterator.next().value).toEqual(1);
                    expect(iterator.next().value).toEqual(2);
                    expect(iterator.next().value).toEqual(3);
                    expect(iterator.next().value).toEqual(4);
                    expect(iterator.next().done).toEqual(true);
                });

                it("check .lastIndexOf() functionality", function() {
                    expect(state.myTestProperty.myI32Array.lastIndexOf(30)).toEqual(3);
                    expect(state.myTestProperty.myI32Array.lastIndexOf(30, -3)).toEqual(-1);
                });

                it("check .map() functionality", function() {
                    const mapped = state.myTestProperty.myI32Array.map((element) => element * 2);
                    expect(mapped.toString()).toEqual("0,20,40,60,80");
                    expect(Object.getPrototypeOf(mapped)).toEqual(Object.getPrototypeOf([]));
                });

                it("check .reduce() functionality", function() {
                    expect(
                        state.myTestProperty.myI32Array.reduce(
                            (accumulator, currentValue) => { return accumulator + currentValue; },
                        ),
                    ).toEqual(100);

                    expect(
                        state.myTestProperty.myI32Array.reduce(
                            (accumulator, currentValue) => { return accumulator + currentValue; },
                            -100,
                        ),
                    ).toEqual(0);
                });

                it("check .reduceRight() functionality", function() {
                    expect(
                        state.myTestProperty.myI32Array.reduceRight(
                            (previousValue, currentValue) => { return previousValue + currentValue; },
                        ),
                    ).toEqual(100);

                    expect(
                        state.myTestProperty.myI32Array.reduceRight(
                            (previousValue, currentValue) => { return previousValue + currentValue; },
                            -100,
                        ),
                    ).toEqual(0);
                });

                it("check .some() functionality", function() {
                    expect(state.myTestProperty.myI32Array.some((element) => (element > 10))).toEqual(true);
                    expect(state.myTestProperty.myI32Array.some((element) => (element > 50))).toEqual(false);
                });

                it("check .toString() functionality", function() {
                    const testArray = state.myTestProperty.myI32Array;
                    expect(testArray.toString()).toEqual("0,10,20,30,40");
                });

                it("check .values() functionality", function() {
                    const iterator = state.myTestProperty.myI32Array.values();
                    expect(iterator.next().value).toEqual(0);
                    expect(iterator.next().value).toEqual(10);
                    expect(iterator.next().value).toEqual(20);
                    expect(iterator.next().value).toEqual(30);
                    expect(iterator.next().value).toEqual(40);
                    expect(iterator.next().done).toEqual(true);
                });

                it("should have the keys detectable through Object.keys() function", function() {
                    const testArray = state.myTestProperty.myI32Array;
                    const tempArray = Object.keys(testArray);
                    expect(tempArray[0]).toEqual("0");
                    expect(tempArray[1]).toEqual("1");
                    expect(tempArray[2]).toEqual("2");
                    expect(tempArray[3]).toEqual("3");
                    expect(tempArray[4]).toEqual("4");
                });
            });

            describe("Setting", function() {
                afterEach(function() {
                    rootNode.get("myTestProperty").get("myI32Array").clear();
                    rootNode.get("myTestProperty").get("myI32Array").insertRange(0, [0, 10, 20, 30, 40]);
                });

                it("should set via direct access", function() {
                    state.myTestProperty.myI32Array[0] = 1;
                    expect(state.myTestProperty.myI32Array[0]).toEqual(1);
                    expect(rootNode.get("myTestProperty").get("myI32Array").get("0")).toEqual(1);

                    expect(() => {
                        state.myTestProperty.myI32Array[0] = [1, 2, 3];
                    }).toThrow("PropertyProxy-007");
                });

                it("should set an element out of range", function() {
                    // Setting and element out of range
                    state.myTestProperty.myI32Array[10] = 100;
                    expect(rootNode.get("myTestProperty").get("myI32Array").getLength()).toEqual(11);
                    expect(rootNode.get("myTestProperty").get("myI32Array").get("10")).toEqual(100);
                });

                it("check .copyWithin() functionality", function() {
                    state.myTestProperty.myI32Array.copyWithin(0, 3, 4);
                    expect(rootNode.get("myTestProperty")
                        .get("myI32Array").getValues().toString()).toEqual("30,10,20,30,40");
                });

                it("check .fill() functionality", function() {
                    state.myTestProperty.myI32Array.fill(0);
                    for (let i = 0; i < state.myTestProperty.myI32Array.length; i++) {
                        expect(rootNode.get("myTestProperty").get("myI32Array").get(i.toString())).toEqual(0);
                    }

                    state.myTestProperty.myI32Array[0] = 0;
                    state.myTestProperty.myI32Array[1] = 10;
                    state.myTestProperty.myI32Array[2] = 20;
                    state.myTestProperty.myI32Array[3] = 30;
                    state.myTestProperty.myI32Array[4] = 40;
                });

                it("check pop() functionality", function() {
                    const popped = state.myTestProperty.myI32Array.pop();
                    expect(popped).toEqual(40);
                    expect(state.myTestProperty.myI32Array.length).toEqual(4);
                    expect(rootNode.get("myTestProperty").get("myI32Array").getLength()).toEqual(4);
                });

                it("check .push() functionality", function() {
                    const testArray = state.myTestProperty.myI32Array;

                    expect(testArray.push(50)).toEqual(6);
                    expect(testArray.length).toEqual(6);
                    expect(testArray[5]).toEqual(50);
                    expect(rootNode.get("myTestProperty").get("myI32Array").getLength()).toEqual(6);
                    expect(rootNode.get("myTestProperty").get("myI32Array").get("5")).toEqual(50);

                    // multiple elements
                    expect(state.myTestProperty.myI32Array.push(60, 70)).toEqual(8);
                    expect(rootNode.get("myTestProperty").get("myI32Array").getLength()).toEqual(8);
                    expect(rootNode.get("myTestProperty").get("myI32Array").get("6")).toEqual(60);
                    expect(rootNode.get("myTestProperty").get("myI32Array").get("7")).toEqual(70);

                    // (proxied) property
                    state.myTestProperty.myI32Array.push(PropertyFactory.create("Int32", "single", 80));
                    expect(rootNode.get("myTestProperty").get("myI32Array").getLength()).toEqual(9);
                    expect(rootNode.get("myTestProperty").get("myI32Array").get("8")).toEqual(80);

                    const proxied = PropertyProxy.proxify(PropertyFactory.create("Int32", "single", 90));
                    state.myTestProperty.myI32Array.push(proxied);
                    expect(rootNode.get("myTestProperty").get("myI32Array").getLength()).toEqual(10);
                    expect(rootNode.get("myTestProperty").get("myI32Array").get("9")).toEqual(90);

                    state.myTestProperty.myI32Array.push(
                        PropertyFactory.create("Int32", "single", 100),
                        PropertyFactory.create("Int32", "single", 110),
                    );
                    expect(rootNode.get("myTestProperty").get("myI32Array").getLength()).toEqual(12);
                    expect(rootNode.get("myTestProperty").get("myI32Array").get("10")).toEqual(100);
                    expect(rootNode.get("myTestProperty").get("myI32Array").get("11")).toEqual(110);

                    expect(() => state.myTestProperty.myI32Array.push([1, 2, 3])).toThrow("PropertyProxy-002");
                });

                it("check .reverse() functionality", function() {
                    state.myTestProperty.myI32Array.reverse();
                    expect(rootNode.resolvePath("myTestProperty.myI32Array")
                        .getValues().toString()).toEqual("40,30,20,10,0");
                });

                it("check .shift() functionality", function() {
                    const oldLength = state.myTestProperty.myI32Array.length;
                    const first = state.myTestProperty.myI32Array.shift();
                    expect(first).toEqual(0);
                    expect(state.myTestProperty.myI32Array.length).toEqual(oldLength - 1);
                    expect(rootNode.resolvePath("myTestProperty.myI32Array").getLength()).toEqual(oldLength - 1);
                    expect(rootNode.resolvePath("myTestProperty.myI32Array[0]")).toEqual(10);
                });

                it("check .sort() functionality", function() {
                    state.myTestProperty.myI32Array.sort((a, b) => b - a);
                    expect(rootNode.resolvePath("myTestProperty.myI32Array")
                        .getValues().toString()).toEqual("40,30,20,10,0");
                });

                it("check .splice() functionality", function() {
                    const oldLength = state.myTestProperty.myI32Array.length;
                    // Replace first element
                    state.myTestProperty.myI32Array.splice(0, 1, 0);
                    expect(state.myTestProperty.myI32Array.length).toEqual(oldLength);
                    expect(rootNode.resolvePath("myTestProperty.myI32Array").getLength()).toEqual(oldLength);

                    // Add some elements
                    state.myTestProperty.myI32Array.splice(5, 0, 50, 60, 70);
                    expect(state.myTestProperty.myI32Array.length).toEqual(oldLength + 3);
                    expect(rootNode.resolvePath("myTestProperty.myI32Array").getLength()).toEqual(oldLength + 3);
                    expect(rootNode.resolvePath("myTestProperty.myI32Array").getValues().toString()).toEqual(
                        "0,10,20,30,40,50,60,70",
                    );

                    // Remove added elements
                    let removed = state.myTestProperty.myI32Array.splice(5, 3);
                    expect(removed[0]).toEqual(50);
                    expect(removed[1]).toEqual(60);
                    expect(removed[2]).toEqual(70);
                    expect(state.myTestProperty.myI32Array.length).toEqual(oldLength);
                    expect(rootNode.resolvePath("myTestProperty.myI32Array").getLength()).toEqual(oldLength);

                    expect(rootNode.resolvePath("myTestProperty.myI32Array")
                        .getValues().toString()).toEqual("0,10,20,30,40");

                    // Re-add elements
                    state.myTestProperty.myI32Array.splice(5, 0, 50, 60, 70);

                    // Remove with negative index
                    removed = state.myTestProperty.myI32Array.splice(-3, 3);
                    expect(removed[0]).toEqual(50);
                    expect(removed[1]).toEqual(60);
                    expect(removed[2]).toEqual(70);
                    expect(state.myTestProperty.myI32Array.length).toEqual(oldLength);
                    expect(rootNode.resolvePath("myTestProperty.myI32Array").getLength()).toEqual(oldLength);

                    // Re-add elements
                    state.myTestProperty.myI32Array.splice(5, 0, 50, 60, 70);

                    // Remove with negative index
                    removed = state.myTestProperty.myI32Array.splice(5);
                    expect(removed[0]).toEqual(50);
                    expect(removed[1]).toEqual(60);
                    expect(removed[2]).toEqual(70);
                    expect(state.myTestProperty.myI32Array.length).toEqual(oldLength);
                    expect(rootNode.resolvePath("myTestProperty.myI32Array").getLength()).toEqual(oldLength);

                    // Add (proxied) properties
                    state.myTestProperty.myI32Array.splice(5, 0,
                        PropertyProxy.proxify(PropertyFactory.create("Int32", "single", 50)),
                        PropertyFactory.create("Int32", "single", 60),
                    );
                    expect(rootNode.resolvePath("myTestProperty.myI32Array").getLength()).toEqual(oldLength + 2);
                    expect(rootNode.resolvePath("myTestProperty.myI32Array").getValues().toString()).toEqual(
                        "0,10,20,30,40,50,60",
                    );

                    expect(() => state.myTestProperty.myI32Array.splice(1, 0, [1, 2, 3])).toThrow("PropertyProxy-002");
                });

                it("check .unshift() functionality", function() {
                    const oldLength = state.myTestProperty.myI32Array.length;
                    state.myTestProperty.myI32Array.unshift(-10);
                    expect(state.myTestProperty.myI32Array.length).toEqual(oldLength + 1);
                    expect(rootNode.resolvePath("myTestProperty.myI32Array").getLength()).toEqual(oldLength + 1);
                    expect(rootNode.resolvePath("myTestProperty.myI32Array[0]")).toEqual(-10);

                    // Add (proxied) properties
                    state.myTestProperty.myI32Array.unshift(
                        PropertyProxy.proxify(PropertyFactory.create("Int32", "single", -20)),
                        PropertyFactory.create("Int32", "single", -30),
                    );
                    expect(rootNode.resolvePath("myTestProperty.myI32Array").getLength()).toEqual(oldLength + 3);
                    expect(rootNode.resolvePath("myTestProperty.myI32Array").getValues().toString()).toEqual(
                        "-20,-30,-10,0,10,20,30,40",
                    );

                    expect(() => state.myTestProperty.myI32Array
                        .unshift([1, 2, 3])).toThrow("PropertyProxy-002");
                });

                it("should be able to adjust array size be setting length", function() {
                    state.myTestProperty.myI32Array.length = 10;
                    expect(rootNode.resolvePath("myTestProperty.myI32Array").getLength()).toEqual(10);

                    state.myTestProperty.myI32Array.length = 5;
                    expect(rootNode.resolvePath("myTestProperty.myI32Array").getLength()).toEqual(5);

                    expect(() => { state.myTestProperty.myI32Array.length = -10; }).toThrow(RangeError);
                });

                it("should update proxy from remote changes", function() {
                    const proxy = state.myTestProperty.myI32Array;
                    expect(proxy[0]).toEqual(0);
                    rootNode.get("myTestProperty").get("myI32Array").set(0, 42);
                    expect(state.myTestProperty.myI32Array[0])
                        .toEqual(rootNode.resolvePath("myTestProperty.myI32Array[0]"));
                    expect(proxy[0]).toEqual(rootNode.resolvePath("myTestProperty.myI32Array[0]"));

                    rootNode.get("myTestProperty").get("myI32Array").push(888);
                    expect(proxy.length).toEqual(rootNode.get("myTestProperty").get("myI32Array").getLength());
                    expect(state.myTestProperty.myI32Array.length).toEqual(
                        rootNode.get("myTestProperty").get("myI32Array").getLength(),
                    );
                    expect(proxy[proxy.length - 1]).toEqual(888);
                });

                it("check behavior of .forEach() if a modification occurs in the loop", function() {
                    const entries: any[] = [];
                    state.myTestProperty.myI32Array.forEach((element) => {
                        entries.push(element);
                        if (element === 20) {
                            state.myTestProperty.myI32Array.shift();
                        }
                    });
                    // entries should not include 30
                    expect(entries.includes(30)).toEqual(false);
                });

                it("should be possible to assign another ArrayProperty", function() {
                    // This will fill the target with clones of the entry;
                    state.myTestProperty.myI32Array = state.constantCollections.primitiveArray;

                    const myI32Array = rootNode.resolvePath("myTestProperty.myI32Array");
                    expect(myI32Array.getLength()).toEqual(3);
                    expect(myI32Array.get(0)).toEqual(42);
                    expect(myI32Array.get(1)).toEqual(43);
                    expect(myI32Array.get(2)).toEqual(44);
                });

                it("should be possible to assign a new iterable", function() {
                    const checkAssignment = () => {
                        const myI32Array = rootNode.resolvePath("myTestProperty.myI32Array");
                        expect(myI32Array.getLength()).toEqual(4);
                        expect(myI32Array.get(0)).toEqual(1);
                        expect(myI32Array.get(1)).toEqual(2);
                        expect(myI32Array.get(2)).toEqual(3);
                        expect(myI32Array.get(3)).toEqual(4);
                        myI32Array.clear();
                    };

                    // Assign pure javascript iterables
                    const numbers = [1, 2, 3, 4];

                    state.myTestProperty.myI32Array = numbers;
                    checkAssignment();

                    // Assign iterables of properties
                    const numbersAsProperties = () => [
                        PropertyFactory.create("Int32", "single", numbers[0]),
                        PropertyFactory.create("Int32", "single", numbers[1]),
                        PropertyFactory.create("Int32", "single", numbers[2]),
                        PropertyFactory.create("Int32", "single", numbers[3]),
                    ];

                    state.myTestProperty.myI32Array = numbersAsProperties();
                    checkAssignment();

                    // Assign iterables of primitive properties in the property tree should work
                    rootNode.insert("Int32Prop", PropertyFactory.create("Int32", "single", 42));

                    state.myTestProperty.myI32Array = [rootNode.resolvePath("Int32Prop")];
                    expect(rootNode.resolvePath("myTestProperty.myI32Array[0]")).toEqual(
                        rootNode.resolvePath("Int32Prop").getValue());
                    rootNode.resolvePath("myTestProperty.myI32Array").clear();

                    // Assigning a non-iterable should throw
                    expect(() => {
                        state.myTestProperty.myI32Array = numbersAsProperties()[0];
                    }).toThrow("PropertyProxy-003");
                });
            });
        });

        describe("Array with complex type entries", function() {
            const arrayWithJsOutfit = [
                { x: 1, y: 2 },
                { x: 10, y: 20 },
            ];

            it("reading entries via directly accessing the indices", function() {
                const tempComplexArray = state.myTestProperty.myComplexArray;
                expect(tempComplexArray[0].x).toEqual(1);
                expect(tempComplexArray[0].y).toEqual(2);
                expect(tempComplexArray[1].x).toEqual(10);
                expect(tempComplexArray[1].y).toEqual(20);
            });

            it("reading array-length using .length", function() {
                const tempComplexArray = state.myTestProperty.myComplexArray;
                expect(tempComplexArray.length).toEqual(2);
            });

            it("Looping through the array indices using a for-in loop", function() {
                const testArray = state.myTestProperty.myComplexArray;
                // The array is defined as [0,1,2,3,...]
                const tempArray: string[] = [];
                // eslint-disable-next-line no-restricted-syntax
                for (const key in testArray) {  // eslint-disable-line guard-for-in
                    tempArray.push(key);
                }
                expect(tempArray.length).toEqual(testArray.length);
                expect(tempArray[0]).toEqual("0");
                expect(tempArray[1]).toEqual("1");
            });

            it("Looping through the array indices using a for loop", function() {
                const tempComplexArray = state.myTestProperty.myComplexArray;
                for (let i = 0; i < tempComplexArray.length; i++) {
                    if (i === 0) {
                        expect(tempComplexArray[i].x).toEqual(1);
                        expect(tempComplexArray[i].y).toEqual(2);
                    } else if (i === 1) {
                        expect(tempComplexArray[i].x).toEqual(10);
                        expect(tempComplexArray[i].y).toEqual(20);
                    }
                }
            });

            it("Looping through the array entries using a for-of loop", function() {
                let counter = 0;
                for (const entry of state.myTestProperty.myComplexArray) {
                    if (entry.x === 1) {
                        expect(entry.y).toEqual(2);
                    } else if (entry.x === 10) {
                        expect(entry.y).toEqual(20);
                    }
                    counter++;
                }
                expect(counter).toEqual(2);
            });

            it("check .every() functionality", function() {
                expect(state.myTestProperty.myComplexArray.every((element) => (element.x < 100))).toEqual(true);
                expect(state.myTestProperty.myComplexArray.every((element) => (element.y < 20))).toEqual(false);
            });

            it("check .filter() functionality", function() {
                const filtered = state.myTestProperty.myComplexArray.filter((element) => (element.x < 10));
                expect(filtered.length).toEqual(1);
            });

            it("check .find() functionality", function() {
                expect(state.myTestProperty.myComplexArray.find(
                    (element) => (element.x < 15 && element.x > 5)).x).toEqual(10);
            });

            it("check .findIndex() functionality", function() {
                expect(state.myTestProperty.myComplexArray.findIndex((
                    element) => (element.x < 15 && element.x > 5))).toEqual(1);
            });

            it("check .forEach() functionality", function() {
                let counter = 0;
                state.myTestProperty.myComplexArray.forEach((entry) => {
                    if (entry.x === 1) {
                        expect(entry.y).toEqual(2);
                    } else if (entry.x === 10) {
                        expect(entry.y).toEqual(20);
                    }
                    counter++;
                });
                expect(counter).toEqual(2);
            });

            it("check .includes() functionality", function() {
                expect(state.myTestProperty.myComplexArray.includes(state.myTestProperty.myComplexArray[0])).toEqual(
                    arrayWithJsOutfit.includes(arrayWithJsOutfit[0]),
                );
                expect(
                    state.myTestProperty.myComplexArray
                        .includes(rootNode.resolvePath("myTestProperty.myComplexArray[0]")),
                ).toEqual(true);
                expect(
                    state.myTestProperty.myComplexArray.includes({ x: 1, y: 2 }),
                ).toEqual(arrayWithJsOutfit.includes({ x: 1, y: 2 }));
                expect(state.myTestProperty.myComplexArray.includes(state.myTestProperty.myComplexArray[0], 1)).toEqual(
                    arrayWithJsOutfit.includes(arrayWithJsOutfit[0], 1),
                );
                expect(state.myTestProperty.myComplexArray
                    .includes(state.myTestProperty.myComplexArray[0], -1)).toEqual(
                        arrayWithJsOutfit.includes(arrayWithJsOutfit[0], -1),
                    );
                expect(state.myTestProperty.myComplexArray
                    .includes(state.myTestProperty.myComplexArray[0], -100)).toEqual(
                        arrayWithJsOutfit.includes(arrayWithJsOutfit[0], -100),
                    );
                expect(state.myTestProperty.myComplexArray.includes(state.myTestProperty.myComplexArray[1], 2)).toEqual(
                    arrayWithJsOutfit.includes(arrayWithJsOutfit[1], 2),
                );
                expect(state.myTestProperty.myComplexArray
                    .includes(state.myTestProperty.myComplexArray[1], 100)).toEqual(
                        arrayWithJsOutfit.includes(arrayWithJsOutfit[1], 100),
                    );
            });

            it("check .join() functionality", function() {
                expect(state.myTestProperty.myComplexArray.join(" ")).toEqual(arrayWithJsOutfit.join(" "));
            });

            it("check .lastIndexOf() functionality", function() {
                expect(state.myTestProperty.myComplexArray.lastIndexOf({ x: 1, y: 2 })).toEqual(
                    arrayWithJsOutfit.lastIndexOf({ x: 1, y: 2 }),
                );
                expect(state.myTestProperty.myComplexArray.lastIndexOf(state.myTestProperty.myComplexArray[1])).toEqual(
                    arrayWithJsOutfit.lastIndexOf(arrayWithJsOutfit[1]),
                );
                expect(state.myTestProperty.myComplexArray
                    .lastIndexOf(state.myTestProperty.myComplexArray[1], 1)).toEqual(
                        arrayWithJsOutfit.lastIndexOf(arrayWithJsOutfit[1], 1),
                    );
                expect(state.myTestProperty.myComplexArray
                    .lastIndexOf(state.myTestProperty.myComplexArray[1], 2)).toEqual(
                        arrayWithJsOutfit.lastIndexOf(arrayWithJsOutfit[1], 2),
                    );
                expect(state.myTestProperty.myComplexArray
                    .lastIndexOf(state.myTestProperty.myComplexArray[1], -1)).toEqual(
                        arrayWithJsOutfit.lastIndexOf(arrayWithJsOutfit[1], -1),
                    );
                expect(
                    state.myTestProperty.myComplexArray
                        .lastIndexOf(rootNode.resolvePath("myTestProperty.myComplexArray[0]")),
                ).toEqual(arrayWithJsOutfit.lastIndexOf(arrayWithJsOutfit[0]));
                expect(
                    state.myTestProperty.myComplexArray.lastIndexOf(state.myTestProperty.myComplexArray[0], -1),
                ).toEqual(arrayWithJsOutfit.lastIndexOf(arrayWithJsOutfit[0], -1));
                expect(
                    state.myTestProperty.myComplexArray.lastIndexOf(state.myTestProperty.myComplexArray[0], -2),
                ).toEqual(arrayWithJsOutfit.lastIndexOf(arrayWithJsOutfit[0], -2));
                expect(
                    state.myTestProperty.myComplexArray.lastIndexOf(state.myTestProperty.myComplexArray[0], -3),
                ).toEqual(arrayWithJsOutfit.lastIndexOf(arrayWithJsOutfit[0], -3));
            });

            it("check .map() functionality", function() {
                expect(state.myTestProperty.myComplexArray.map((element) => element.x * 2).toString()).toEqual("2,20");
            });

            it("check .reduce() functionality", function() {
                expect(state.myTestProperty.myComplexArray.reduce((accumulator, currentValue) => {
                    return accumulator.x + accumulator.y + currentValue.x + currentValue.y;
                })).toEqual(33);

                expect(state.myTestProperty.myComplexArray.reduce((accumulator, currentValue) => {
                    return accumulator + currentValue.x + currentValue.y;
                }, -33)).toEqual(0);
            });

            it("check .reduceRight() functionality", function() {
                expect(state.myTestProperty.myComplexArray.reduceRight((previousValue, currentValue) => {
                    return previousValue.x + previousValue.y + currentValue.x + currentValue.y;
                })).toEqual(33);

                expect(state.myTestProperty.myComplexArray.reduceRight((previousValue, currentValue) => {
                    return previousValue + currentValue.x + currentValue.y;
                }, -33)).toEqual(0);
            });

            it("check .some() functionality", function() {
                expect(state.myTestProperty.myComplexArray.some((element) => (element.x > 1))).toEqual(true);
                expect(state.myTestProperty.myComplexArray.some((element) => (element.x > 50))).toEqual(false);
            });

            it("check .toString() functionality", function() {
                const testArray = state.myTestProperty.myComplexArray;
                expect(testArray.toString()).toEqual(arrayWithJsOutfit.toString());
            });

            it("check .values() functionality", function() {
                const iterator = state.myTestProperty.myComplexArray.values();
                expect(iterator.next().value.x).toEqual(1);
                expect(iterator.next().value.x).toEqual(10);
                expect(iterator.next().done).toEqual(true);
            });

            describe("Setting", function() {
                afterEach(function() {
                    rootNode.get("myTestProperty").get("myComplexArray").clear();
                    rootNode.get("myTestProperty").get("myComplexArray").insertRange(0,
                        [
                            PropertyFactory
                                .create("autodesk.appframework.tests:myVector2D-1.0.0", "single", { x: 1, y: 2 }),
                            PropertyFactory
                                .create("autodesk.appframework.tests:myVector2D-1.0.0", "single", { x: 10, y: 20 }),
                        ],
                    );
                });

                it("should set via direct access", function() {
                    state.myTestProperty.myComplexArray[0].x = 42;
                    expect(rootNode.resolvePath("myTestProperty.myComplexArray[0].x").getValue()).toEqual(42);
                    expect(state.myTestProperty.myComplexArray[0].x).toEqual(42);
                    state.myTestProperty.myComplexArray[0] = { x: 3, y: 4 };
                    expect(state.myTestProperty.myComplexArray[0].x).toEqual(3);
                    expect(state.myTestProperty.myComplexArray[0].y).toEqual(4);
                    expect(rootNode.resolvePath("myTestProperty.myComplexArray[0].x").getValue()).toEqual(3);
                    expect(rootNode.resolvePath("myTestProperty.myComplexArray[0].y").getValue()).toEqual(4);

                    // (proxied) properties
                    state.myTestProperty.myComplexArray[0] = PropertyProxy.proxify(
                        PropertyFactory.create(vector2DTemplate.typeid, "single", { x: 30, y: 40 }),
                    );
                    expect(rootNode.get("myTestProperty")
                        .get("myComplexArray").get("0").get("x").getValue()).toEqual(30);
                    expect(rootNode.get("myTestProperty")
                        .get("myComplexArray").get("0").get("y").getValue()).toEqual(40);

                    state.myTestProperty.myComplexArray[0] = PropertyFactory.create(
                        vector2DTemplate.typeid, "single", { x: 5, y: 6 },
                    );
                    expect(rootNode.get("myTestProperty")
                        .get("myComplexArray").get("0").get("x").getValue()).toEqual(5);
                    expect(rootNode.get("myTestProperty")
                        .get("myComplexArray").get("0").get("y").getValue()).toEqual(6);

                    // polymorphic
                    state.myTestProperty.myComplexArray[0] = PropertyFactory.create(
                        vector3DTemplate.typeid, "single", { x: 50, y: 60, z: 1 },
                    );
                    expect(rootNode.get("myTestProperty")
                        .get("myComplexArray").get("0").get("x").getValue()).toEqual(50);
                    expect(rootNode.get("myTestProperty")
                        .get("myComplexArray").get("0").get("y").getValue()).toEqual(60);
                    expect(rootNode.get("myTestProperty")
                        .get("myComplexArray").get("0").get("z").getValue()).toEqual(1);
                });

                it("should set an element out of range", function() {
                    // Setting and element out of range
                    state.myTestProperty.myComplexArray[10] = { x: 100, y: 100 };
                    expect(rootNode.get("myTestProperty")
                        .get("myComplexArray").getLength()).toEqual(11);
                    expect(rootNode.get("myTestProperty")
                        .get("myComplexArray").get(10).get("x").getValue()).toEqual(100);
                    expect(rootNode.get("myTestProperty")
                        .get("myComplexArray").get(10).get("y").getValue()).toEqual(100);
                });

                it("check .concat() functionality", function() {
                    const concat = state.myTestProperty.myComplexArray.concat(["a", "b", "c"],
                        state.myTestProperty.myComplexArray);
                    expect(concat.length).toEqual(7);

                    // should still be able to change underlying properties via the proxies in the concatenated array
                    concat[0].x = 42;
                    expect(state.myTestProperty.myComplexArray[0].x).toEqual(42);
                    expect(concat[5].x).toEqual(42);
                    expect(rootNode.resolvePath("myTestProperty.myComplexArray[0].x").getValue()).toEqual(42);
                });

                it("check .copyWithin() functionality", function() {
                    // add polymorphic entry
                    rootNode.resolvePath("myTestProperty.myComplexArray").push(
                        PropertyFactory.create(vector3DTemplate.typeid, "single", { x: 100, y: 100, z: 1 }),
                    );
                    const entry = rootNode.resolvePath("myTestProperty.myComplexArray[2]");

                    state.myTestProperty.myComplexArray.copyWithin(0, 2, 3);
                    expect(rootNode.get("myTestProperty").get("myComplexArray").get(0).getValues().x).toEqual(100);
                    expect(rootNode.get("myTestProperty").get("myComplexArray").get(0).getValues().y).toEqual(100);
                    expect(rootNode.get("myTestProperty").get("myComplexArray").get(0).getValues().z).toEqual(1);

                    expect(rootNode.get("myTestProperty").get("myComplexArray").get(2).getValues().x).toEqual(100);
                    expect(rootNode.get("myTestProperty").get("myComplexArray").get(2).getValues().y).toEqual(100);
                    expect(rootNode.get("myTestProperty").get("myComplexArray").get(2).getValues().z).toEqual(1);

                    expect(rootNode.get("myTestProperty").get("myComplexArray").get(2)).toEqual(entry);

                    expect(() => {
                        state.myTestProperty.myComplexArray[0] = rootNode.resolvePath("myTestProperty.myVector");
                    }).toThrow();
                });

                it("check .fill() functionality", function() {
                    state.myTestProperty.myComplexArray.fill({ x: 1, y: 2 });
                    for (let i = 0; i < state.myTestProperty.myComplexArray.length; i++) {
                        expect(
                            rootNode.get("myTestProperty").get("myComplexArray").get(i.toString()).get("x").getValue(),
                        ).toEqual(1);
                        expect(
                            rootNode.get("myTestProperty").get("myComplexArray").get(i.toString()).get("y").getValue(),
                        ).toEqual(2);
                    }

                    state.myTestProperty.myComplexArray.fill(
                        PropertyFactory.create(vector2DTemplate.typeid, "single", { x: 3, y: 4 }),
                    );
                    for (let i = 0; i < state.myTestProperty.myComplexArray.length; i++) {
                        expect(
                            rootNode.get("myTestProperty").get("myComplexArray").get(i.toString()).get("x").getValue(),
                        ).toEqual(3);
                        expect(
                            rootNode.get("myTestProperty").get("myComplexArray").get(i.toString()).get("y").getValue(),
                        ).toEqual(4);
                    }

                    state.myTestProperty.myComplexArray.fill(
                        PropertyProxy.proxify(
                            PropertyFactory.create(vector2DTemplate.typeid, "single", { x: 5, y: 6 })),
                    );
                    for (let i = 0; i < state.myTestProperty.myComplexArray.length; i++) {
                        expect(
                            rootNode.get("myTestProperty").get("myComplexArray").get(i.toString()).get("x").getValue(),
                        ).toEqual(5);
                        expect(
                            rootNode.get("myTestProperty").get("myComplexArray").get(i.toString()).get("y").getValue(),
                        ).toEqual(6);
                    }

                    // polymorphic
                    state.myTestProperty.myComplexArray.fill(
                        PropertyProxy.proxify(PropertyFactory.create(vector3DTemplate.typeid, "single",
                            { x: 7, y: 8, z: 1 })));
                    for (let i = 0; i < state.myTestProperty.myComplexArray.length; i++) {
                        expect(
                            rootNode.get("myTestProperty").get("myComplexArray").get(i.toString()).get("x").getValue(),
                        ).toEqual(7);
                        expect(
                            rootNode.get("myTestProperty").get("myComplexArray").get(i.toString()).get("y").getValue(),
                        ).toEqual(8);
                        expect(
                            rootNode.get("myTestProperty").get("myComplexArray").get(i.toString()).get("z").getValue(),
                        ).toEqual(1);
                    }

                    expect(() => {
                        state.myTestProperty.myComplexArray[0] = rootNode.resolvePath("myTestProperty.myVector");
                    }).toThrow();
                });

                it("check .pop() functionality", function() {
                    const popped = state.myTestProperty.myComplexArray.pop();
                    expect(popped.x).toEqual(10);
                    expect(popped.y).toEqual(20);
                    expect(rootNode.get("myTestProperty").get("myComplexArray").getLength()).toEqual(1);
                });

                it("check .push() functionality", function() {
                    expect(state.myTestProperty.myComplexArray.push({ x: 3, y: 4 })).toEqual(3);
                    expect(rootNode.get("myTestProperty")
                        .get("myComplexArray").getLength()).toEqual(3);
                    expect(rootNode.get("myTestProperty")
                        .get("myComplexArray").get("2").get("x").getValue()).toEqual(3);
                    expect(rootNode.get("myTestProperty")
                        .get("myComplexArray").get("2").get("y").getValue()).toEqual(4);

                    // multiple elements
                    expect(state.myTestProperty.myComplexArray.push({ x: 30, y: 40 }, { x: 5, y: 6 })).toEqual(5);
                    expect(rootNode.get("myTestProperty")
                        .get("myComplexArray").getLength()).toEqual(5);
                    expect(rootNode.get("myTestProperty")
                        .get("myComplexArray").get("3").get("x").getValue()).toEqual(30);
                    expect(rootNode.get("myTestProperty")
                        .get("myComplexArray").get("3").get("y").getValue()).toEqual(40);
                    expect(rootNode.get("myTestProperty")
                        .get("myComplexArray").get("4").get("x").getValue()).toEqual(5);
                    expect(rootNode.get("myTestProperty")
                        .get("myComplexArray").get("4").get("y").getValue()).toEqual(6);

                    // (proxied) properties
                    state.myTestProperty.myComplexArray.push(
                        PropertyProxy.proxify(PropertyFactory.create(vector2DTemplate.typeid, "single",
                            { x: 50, y: 60 })),
                        PropertyFactory.create(vector2DTemplate.typeid, "single", { x: 7, y: 8 }),
                    );
                    expect(rootNode.get("myTestProperty")
                        .get("myComplexArray").getLength()).toEqual(7);
                    expect(rootNode.get("myTestProperty")
                        .get("myComplexArray").get("5").get("x").getValue()).toEqual(50);
                    expect(rootNode.get("myTestProperty")
                        .get("myComplexArray").get("5").get("y").getValue()).toEqual(60);
                    expect(rootNode.get("myTestProperty")
                        .get("myComplexArray").get("6").get("x").getValue()).toEqual(7);
                    expect(rootNode.get("myTestProperty")
                        .get("myComplexArray").get("6").get("y").getValue()).toEqual(8);

                    // polymorphic
                    state.myTestProperty.myComplexArray.push(
                        PropertyFactory.create(vector3DTemplate.typeid, "single", { x: 70, y: 80, z: 1 }),
                    );
                    expect(rootNode.get("myTestProperty")
                        .get("myComplexArray").getLength()).toEqual(8);
                    expect(rootNode.get("myTestProperty")
                        .get("myComplexArray").get("7").get("x").getValue()).toEqual(70);
                    expect(rootNode.get("myTestProperty")
                        .get("myComplexArray").get("7").get("y").getValue()).toEqual(80);
                    expect(rootNode.get("myTestProperty")
                        .get("myComplexArray").get("7").get("z").getValue()).toEqual(1);
                });

                it("check .reverse() functionality", function() {
                    const entry = rootNode.resolvePath("myTestProperty.myComplexArray[0]");
                    state.myTestProperty.myComplexArray.reverse();
                    expect(rootNode.resolvePath("myTestProperty.myComplexArray[0].x").getValue()).toEqual(10);
                    expect(rootNode.resolvePath("myTestProperty.myComplexArray[1].x").getValue()).toEqual(1);
                    // Check that it still refers to the same property
                    expect(rootNode.resolvePath("myTestProperty.myComplexArray[1]")).toEqual(entry);

                    expect(() => {
                        state.myTestProperty.myComplexArray[0] = rootNode.resolvePath("myTestProperty.myVector");
                    }).toThrow();
                });

                it("check .shift() functionality", function() {
                    const oldLength = state.myTestProperty.myComplexArray.length;
                    const first = state.myTestProperty.myComplexArray.shift();
                    expect(first.x).toEqual(1);
                    expect(first.y).toEqual(2);
                    expect(state.myTestProperty.myComplexArray.length).toEqual(oldLength - 1);
                    expect(rootNode.resolvePath("myTestProperty.myComplexArray").getLength()).toEqual(oldLength - 1);

                    expect(() => {
                        state.myTestProperty.myComplexArray[0] = rootNode.resolvePath("myTestProperty.myVector");
                    }).toThrow();
                });

                it("check .sort() functionality", function() {
                    const entry = rootNode.resolvePath("myTestProperty.myComplexArray[0]");

                    // add polymorphic entry
                    rootNode.resolvePath("myTestProperty.myComplexArray").push(
                        PropertyFactory.create(vector3DTemplate.typeid, "single", { x: 100, y: 100, z: 1 }),
                    );

                    state.myTestProperty.myComplexArray.sort((a, b) => b.x - a.x);
                    expect(rootNode.resolvePath("myTestProperty.myComplexArray[0].x").getValue()).toEqual(100);
                    expect(rootNode.resolvePath("myTestProperty.myComplexArray[1].x").getValue()).toEqual(10);
                    expect(rootNode.resolvePath("myTestProperty.myComplexArray[2].x").getValue()).toEqual(1);

                    expect(
                        rootNode.resolvePath("myTestProperty.myComplexArray[0]").getTypeid(),
                    ).toEqual(vector3DTemplate.typeid);
                    expect(
                        rootNode.resolvePath("myTestProperty.myComplexArray[1]").getTypeid(),
                    ).toEqual(vector2DTemplate.typeid);
                    expect(
                        rootNode.resolvePath("myTestProperty.myComplexArray[2]").getTypeid(),
                    ).toEqual(vector2DTemplate.typeid);

                    // Check that it still refers to the same property
                    expect(rootNode.resolvePath("myTestProperty.myComplexArray[2]")).toEqual(entry);
                });

                it("check .swap() functionality", function() {
                    const entry0 = rootNode.resolvePath("myTestProperty.myComplexArray[0]");
                    const entry1 = rootNode.resolvePath("myTestProperty.myComplexArray[1]");

                    state.myTestProperty.myComplexArray.swap(0, 1);

                    expect(rootNode.resolvePath("myTestProperty.myComplexArray[1]")).toEqual(entry0);
                    expect(rootNode.resolvePath("myTestProperty.myComplexArray[0]")).toEqual(entry1);
                    expect(rootNode.resolvePath("myTestProperty.myComplexArray[1].x").getValue()).toEqual(1);
                    expect(rootNode.resolvePath("myTestProperty.myComplexArray[1].y").getValue()).toEqual(2);
                    expect(rootNode.resolvePath("myTestProperty.myComplexArray[0].x").getValue()).toEqual(10);
                    expect(rootNode.resolvePath("myTestProperty.myComplexArray[0].y").getValue()).toEqual(20);
                });

                it("check .splice() functionality", function() {
                    const oldLength = state.myTestProperty.myComplexArray.length;
                    // Replace first element
                    state.myTestProperty.myComplexArray.splice(0, 1, { x: 1, y: 2 });
                    expect(state.myTestProperty.myComplexArray.length).toEqual(oldLength);
                    expect(rootNode.resolvePath("myTestProperty.myComplexArray").getLength()).toEqual(oldLength);

                    // Add some elements
                    state.myTestProperty.myComplexArray.splice(2, 0, { x: 3, y: 4 }, { x: 30, y: 40 });
                    expect(state.myTestProperty.myComplexArray.length).toEqual(oldLength + 2);
                    expect(rootNode.resolvePath("myTestProperty.myComplexArray").getLength()).toEqual(oldLength + 2);
                    const newArrayWithJsOutfit = [
                        { x: 1, y: 2 },
                        { x: 10, y: 20 },
                        { x: 3, y: 4 },
                        { x: 30, y: 40 },
                    ];
                    expect(rootNode.resolvePath("myTestProperty.myComplexArray").getValues().toString()).toEqual(
                        newArrayWithJsOutfit.toString(),
                    );

                    // Remove added elements
                    const removed = state.myTestProperty.myComplexArray.splice(2, 2);
                    expect(removed[0].x).toEqual(3);
                    expect(removed[0].y).toEqual(4);
                    expect(removed[1].x).toEqual(30);
                    expect(removed[1].y).toEqual(40);

                    expect(state.myTestProperty.myComplexArray.length).toEqual(oldLength);
                    expect(rootNode.resolvePath("myTestProperty.myComplexArray").getLength()).toEqual(oldLength);

                    arrayWithJsOutfit.splice(2, 2);
                    expect(rootNode.resolvePath("myTestProperty.myComplexArray").getValues().toString()).toEqual(
                        arrayWithJsOutfit.toString(),
                    );
                });

                it("check .unshift() functionality", function() {
                    const oldLength = state.myTestProperty.myComplexArray.length;
                    expect(state.myTestProperty.myComplexArray.unshift({ x: -1, y: -2 })).toEqual(oldLength + 1);
                    expect(state.myTestProperty.myComplexArray.length).toEqual(oldLength + 1);
                    expect(rootNode.resolvePath("myTestProperty.myComplexArray").getLength()).toEqual(oldLength + 1);
                    expect(rootNode.resolvePath("myTestProperty.myComplexArray[0].x").getValue()).toEqual(-1);
                    expect(rootNode.resolvePath("myTestProperty.myComplexArray[0].y").getValue()).toEqual(-2);
                });

                it("should be able to adjust array size be setting length", function() {
                    state.myTestProperty.myComplexArray.length = 4;
                    expect(rootNode.resolvePath("myTestProperty.myComplexArray").getLength()).toEqual(4);
                });

                it("should be possible to assign another ArrayProperty", function() {
                    // This will fill the target with clones of the entry;
                    state.myTestProperty.myComplexArray = state.constantCollections.nonPrimitiveArray;

                    const myComplexArray = rootNode.resolvePath("myTestProperty.myComplexArray");
                    expect(myComplexArray.getLength()).toEqual(2);
                    expect(myComplexArray.get(0).get("x").getValue()).toEqual(42);
                    expect(myComplexArray.get(0).get("y").getValue()).toEqual(43);
                    expect(myComplexArray.get(1).get("x").getValue()).toEqual(44);
                    expect(myComplexArray.get(1).get("y").getValue()).toEqual(45);
                });

                it("should be possible to assign a new iterable", function() {
                    const checkAssignment = () => {
                        const complexArray = rootNode.resolvePath("myTestProperty.myComplexArray");
                        expect(complexArray.getLength()).toEqual(2);
                        expect(complexArray.get(0).get("x").getValue()).toEqual(1);
                        expect(complexArray.get(0).get("y").getValue()).toEqual(2);
                        expect(complexArray.get(1).get("x").getValue()).toEqual(3);
                        expect(complexArray.get(1).get("y").getValue()).toEqual(4);
                        complexArray.clear();
                    };

                    // Assign pure javascript iterables
                    const vectors = [{ x: 1, y: 2 }, { x: 3, y: 4 }];

                    state.myTestProperty.myComplexArray = vectors;
                    checkAssignment();

                    // Assign iterables of properties
                    const vectorsAsProperties = () => [
                        PropertyFactory.create(vector2DTemplate.typeid, "single", vectors[0]),
                        PropertyFactory.create(vector2DTemplate.typeid, "single", vectors[1]),
                    ];

                    state.myTestProperty.myComplexArray = vectorsAsProperties();
                    checkAssignment();

                    // Assign iterables of properties in the property tree should throw
                    expect(() => {
                        state.myTestProperty.myComplexArray = [rootNode.get("myTestProperty").get("myVector")];
                    }).toThrow();

                    // Assigning a non-iterable should throw
                    expect(() => {
                        state.myTestProperty.myComplexArray = vectorsAsProperties()[0];
                    }).toThrow("PropertyProxy-003");
                });
            });
        });

        describe("Array of collections", function() {
            it("should be able to access nested collections", function() {
                expect(state.myGenericArray.length).toEqual(3);

                // Nested array
                expect(state.myGenericArray[0][0]).toEqual(0);
                expect(state.myGenericArray[0][1]).toEqual(1);
                expect(state.myGenericArray[0][2]).toEqual(2);
                expect(state.myGenericArray[0][3]).toEqual(3);

                // Nested map
                expect(state.myGenericArray[1].get("a")).toEqual(0);
                expect(state.myGenericArray[1].get("b")).toEqual(1);
                expect(state.myGenericArray[1].get("c")).toEqual(2);

                // Nested set
                expect(state.myGenericArray[2].size).toEqual(2);
            });

            it("should be able to set entries of nested collections", function() {
                state.myGenericArray[0][0] = 84;
                expect(rootNode.resolvePath("myGenericArray[0][0]")).toEqual(84);

                state.myGenericArray[1].set("a", 85);
                expect(rootNode.resolvePath("myGenericArray[1][a]")).toEqual(85);

                // Assign primitive array property
                state.myGenericArray[0] = state.constantCollections.primitiveArray;
                expect(rootNode.resolvePath("myGenericArray[0]").getLength()).toEqual(3);
                expect(rootNode.resolvePath("myGenericArray[0][0]")).toEqual(42);
                expect(rootNode.resolvePath("myGenericArray[0][1]")).toEqual(43);
                expect(rootNode.resolvePath("myGenericArray[0][2]")).toEqual(44);

                // Assign non-primitive array property
                rootNode.resolvePath("myGenericArray").shift();
                rootNode.resolvePath("myGenericArray").unshift(
                    PropertyFactory.create(vector2DTemplate.typeid, "array"));
                state.myGenericArray[0] = state.constantCollections.nonPrimitiveArray;
                expect(rootNode.resolvePath("myGenericArray[0]").getLength()).toEqual(2);
                expect(rootNode.resolvePath("myGenericArray[0][0].x").getValue()).toEqual(42);
                expect(rootNode.resolvePath("myGenericArray[0][0].y").getValue()).toEqual(43);
                expect(rootNode.resolvePath("myGenericArray[0][1].x").getValue()).toEqual(44);
                expect(rootNode.resolvePath("myGenericArray[0][1].y").getValue()).toEqual(45);

                // Assign primitive map property
                state.myGenericArray[1] = state.constantCollections.primitiveMap;
                expect(rootNode.resolvePath("myGenericArray[1]").getIds().length).toEqual(2);
                expect(rootNode.resolvePath("myGenericArray[1][a]")).toEqual(42);
                expect(rootNode.resolvePath("myGenericArray[1][b]")).toEqual(43);

                // Assign non-primitive map property
                rootNode.get("myGenericArray").remove(1);
                rootNode.get("myGenericArray").insert(1,
                    PropertyFactory.create(vector2DTemplate.typeid, "map"));
                state.myGenericArray[1] = state.constantCollections.nonPrimitiveMap;
                expect(rootNode.resolvePath("myGenericArray[1]").getIds().length).toEqual(2);
                expect(rootNode.resolvePath("myGenericArray[1][a].x").getValue()).toEqual(42);
                expect(rootNode.resolvePath("myGenericArray[1][a].y").getValue()).toEqual(43);
                expect(rootNode.resolvePath("myGenericArray[1][b].x").getValue()).toEqual(44);
                expect(rootNode.resolvePath("myGenericArray[1][b].y").getValue()).toEqual(45);

                // Assign a set
                state.myGenericArray[2] = state.constantCollections.bookSet;
                const setEntries = rootNode.resolvePath("myGenericArray[2]").getAsArray();
                expect(setEntries.length).toEqual(2);
                expect(setEntries[0].get("book").getValue()).toEqual("The Hobbit");
                expect(setEntries[0].get("author").getValue()).toEqual("Tolkien");
                expect(setEntries[1].get("book").getValue()).toEqual("Faust");
                expect(setEntries[1].get("author").getValue()).toEqual("Goethe");
            });
        });

        describe("Map", function() {
            describe("Int32 Maps", function() {
                it("should return the size of the map using .size property", function() {
                    const testMap = state.myTestProperty.myMap;
                    expect(testMap.size).toEqual(3);
                });

                it("should be able to access the map using a for-of loop", function() {
                    const testMap = state.myTestProperty.myMap;
                    const tempArray: any[] = [];
                    for (const entry of testMap) {
                        tempArray.push(entry);
                    }
                    expect(tempArray[0][1]).toEqual(1111);
                    expect(tempArray[1][1]).toEqual(2222);
                    expect(tempArray[2][1]).toEqual(3333);
                });

                it("should return true on `instanceOf` checks", function() {
                    expect((state.myTestProperty.myMap instanceof Map)).toEqual(true);
                });

                it("check .entries() functionality", function() {
                    const entriesIterator = state.myTestProperty.myMap.entries();
                    expect(entriesIterator.next().value.toString()).toEqual("firstNumber,1111");
                    expect(entriesIterator.next().value.toString()).toEqual("secondNumber,2222");
                    expect(entriesIterator.next().value.toString()).toEqual("thirdNumber,3333");
                });

                it("check .forEach() functionality", function() {
                    const testMap = state.myTestProperty.myMap;
                    const tempArray: number[] = [];
                    const squareIt = function(value) {
                        tempArray.push(value * value);
                    };
                    testMap.forEach(squareIt);
                    expect(tempArray[0]).toEqual(1111 * 1111);
                    expect(tempArray[1]).toEqual(2222 * 2222);
                    expect(tempArray[2]).toEqual(3333 * 3333);
                });

                it("check .get() functionality", function() {
                    const testMap = state.myTestProperty.myMap;
                    expect(testMap.get("firstNumber")).toEqual(1111);
                });

                it("check .keys() functionality", function() {
                    const keysIterator = state.myTestProperty.myMap.keys();
                    expect(keysIterator.next().value).toEqual("firstNumber");
                    expect(keysIterator.next().value).toEqual("secondNumber");
                    expect(keysIterator.next().value).toEqual("thirdNumber");
                });

                it("check .toString() functionality", function() {
                    const testMap = state.myTestProperty.myMap;
                    const mapWithJsOutfit = new Map();
                    mapWithJsOutfit.set("firstNumber", 1111);
                    mapWithJsOutfit.set("secondNumber", 2222);
                    mapWithJsOutfit.set("thirdNumber", 3333);
                    expect(testMap.toString()).toEqual(mapWithJsOutfit.toString());
                });

                it("check .values() functionality", function() {
                    const valuesIterator = state.myTestProperty.myMap.values();
                    expect(valuesIterator.next().value).toEqual(1111);
                    expect(valuesIterator.next().value).toEqual(2222);
                    expect(valuesIterator.next().value).toEqual(3333);
                });

                it("should reflect remote changes", function() {
                    const myMap = state.myTestProperty.myMap;
                    expect(myMap.size).toEqual(3);
                    rootNode.resolvePath("myTestProperty.myMap").insert("fourthNumber", 4444);
                    expect(myMap.size).toEqual(4);
                    expect(myMap.get("fourthNumber")).toEqual(4444);
                    rootNode.resolvePath("myTestProperty.myMap").remove("fourthNumber");
                    expect(myMap.size).toEqual(3);
                });

                describe("Setting", function() {
                    afterEach(function() {
                        rootNode.resolvePath("myTestProperty.myMap").clear();
                        rootNode.resolvePath("myTestProperty.myMap").insert("firstNumber", 1111);
                        rootNode.resolvePath("myTestProperty.myMap").insert("secondNumber", 2222);
                        rootNode.resolvePath("myTestProperty.myMap").insert("thirdNumber", 3333);
                    });

                    it("check .clear() functionality", function() {
                        expect(rootNode.resolvePath("myTestProperty.myMap").getIds().length).toEqual(3);
                        state.myTestProperty.myMap.clear();
                        expect(rootNode.resolvePath("myTestProperty.myMap").getIds().length).toEqual(0);
                    });

                    it("check .delete() functionality", function() {
                        expect(state.myTestProperty.myMap.has("firstNumber")).toEqual(true);
                        expect(rootNode.get("myTestProperty").get("myMap").has("firstNumber")).toEqual(true);
                        expect(state.myTestProperty.myMap.delete("firstNumber")).toEqual(true);
                        expect(state.myTestProperty.myMap.delete("nonExistingEntry")).toEqual(false);
                        expect(state.myTestProperty.myMap.has("fistNumber")).toEqual(false);
                        expect(rootNode.get("myTestProperty").get("myMap").has("firstNumber")).toEqual(false);
                    });

                    it("check .set() functionality", function() {
                        // Modify entry
                        state.myTestProperty.myMap.set("firstNumber", 42);
                        expect(rootNode.resolvePath("myTestProperty.myMap[firstNumber]")).toEqual(42);

                        // Insert entry
                        state.myTestProperty.myMap.set("fourthNumber", 4444);
                        expect(rootNode.resolvePath("myTestProperty.myMap[fourthNumber]")).toEqual(4444);

                        // Insert (proxied) property
                        state.myTestProperty.myMap.set("fifthNumber",
                            PropertyFactory.create("Int32", "single", 5555));
                        expect(rootNode.resolvePath("myTestProperty.myMap[fifthNumber]")).toEqual(5555);

                        state.myTestProperty.myMap.set("sixthNumber",
                            PropertyProxy.proxify(PropertyFactory.create("Int32", "single", 6666)));
                        expect(rootNode.resolvePath("myTestProperty.myMap[sixthNumber]")).toEqual(6666);

                        // Insert non matching property
                        const floatProperty = PropertyFactory.create("Float32", "single", 7.7);
                        state.myTestProperty.myMap.set("seventhNumber", floatProperty);
                        expect(rootNode.resolvePath("myTestProperty.myMap[seventhNumber]")).toEqual(7);
                    });

                    it("should be possible to assign another MapProperty", function() {
                        state.myTestProperty.myMap = state.constantCollections.primitiveMap;

                        const map = rootNode.resolvePath("myTestProperty.myMap");
                        expect(map.getIds().length).toEqual(2);
                        expect(map.get("a")).toEqual(42);
                        expect(map.get("b")).toEqual(43);
                    });

                    it("should be possible to assign a new iterable", function() {
                        const checkAssignment = () => {
                            expect(rootNode.resolvePath("myTestProperty.myMap[a]")).toEqual(1);
                            expect(rootNode.resolvePath("myTestProperty.myMap[b]")).toEqual(2);
                            rootNode.resolvePath("myTestProperty.myMap").clear();
                        };

                        // Assign pure javascript iterables
                        const entries: [string, number][] = [["a", 1], ["b", 2]];
                        state.myTestProperty.myMap = new Map<string, number>(entries);
                        checkAssignment();

                        state.myTestProperty.myMap = entries;
                        checkAssignment();

                        // Assign iterables of properties
                        const entriesAsProperties = (): [string, BaseProperty][] => [
                            [entries[0][0], PropertyFactory.create("Int32", "single", entries[0][1])],
                            [entries[1][0], PropertyFactory.create("Int32", "single", entries[1][1])],
                        ];

                        state.myTestProperty.myMap = new Map(entriesAsProperties());
                        checkAssignment();

                        state.myTestProperty.myMap = entriesAsProperties();
                        checkAssignment();
                    });
                });
            });

            describe("Maps with complex entries", function() {
                it("should return the size of the complex-map using .size property", function() {
                    const testMap = state.myTestProperty.myComplexMap;
                    expect(testMap.size).toEqual(3);
                });

                it("for-of loop corresponding to complex-map", function() {
                    const testMap = state.myTestProperty.myComplexMap;
                    const tempArray: any[] = [];
                    for (const entry of testMap) {
                        tempArray.push(entry);
                    }
                    expect(tempArray[0][1].x).toEqual(10);
                    expect(tempArray[0][1].y).toEqual(20);
                    expect(tempArray[1][1].x).toEqual(30);
                    expect(tempArray[1][1].y).toEqual(40);
                    expect(tempArray[2][1].x).toEqual(50);
                    expect(tempArray[2][1].y).toEqual(60);
                });

                it("check .entries() functionality", function() {
                    const entriesIterator = state.myTestProperty.myComplexMap.entries();

                    let first = false;
                    let second = false;
                    let third = false;
                    let current = entriesIterator.next();
                    while (!current.done) {
                        switch (current.value[0]) {
                            case "firstEntry":
                                first = true;
                                expect(current.value[1].x).toEqual(10);
                                expect(current.value[1].y).toEqual(20);
                                break;
                            case "secondEntry":
                                second = true;
                                expect(current.value[1].x).toEqual(30);
                                expect(current.value[1].y).toEqual(40);
                                break;
                            case "thirdEntry":
                                third = true;
                                expect(current.value[1].x).toEqual(50);
                                expect(current.value[1].y).toEqual(60);
                                break;
                            default:
                                break;
                        }
                        current = entriesIterator.next();
                    }
                    expect(first).toEqual(true);
                    expect(second).toEqual(true);
                    expect(third).toEqual(true);
                });

                it("check .forEach() functionality", function() {
                    let first = false;
                    let second = false;
                    let third = false;
                    state.myTestProperty.myComplexMap.forEach(function(value, key) {
                        switch (key) {
                            case "firstEntry":
                                first = true;
                                expect(value.x).toEqual(10);
                                expect(value.y).toEqual(20);
                                break;
                            case "secondEntry":
                                second = true;
                                expect(value.x).toEqual(30);
                                expect(value.y).toEqual(40);
                                break;
                            case "thirdEntry":
                                third = true;
                                expect(value.x).toEqual(50);
                                expect(value.y).toEqual(60);
                                break;
                            default:
                                break;
                        }
                    });
                    expect(first).toEqual(true);
                    expect(second).toEqual(true);
                    expect(third).toEqual(true);
                });

                it("should access a complex-map using get()", function() {
                    const testMap = state.myTestProperty.myComplexMap;
                    expect(testMap.get("firstEntry").x).toEqual(10);
                    expect(testMap.get("firstEntry").y).toEqual(20);
                    expect(testMap.get("secondEntry").x).toEqual(30);
                    expect(testMap.get("secondEntry").y).toEqual(40);
                    expect(testMap.get("thirdEntry").x).toEqual(50);
                    expect(testMap.get("thirdEntry").y).toEqual(60);
                });

                it("check .keys() functionality", function() {
                    const keysIterator = state.myTestProperty.myComplexMap.keys();
                    expect(keysIterator.next().value).toEqual("firstEntry");
                    expect(keysIterator.next().value).toEqual("secondEntry");
                    expect(keysIterator.next().value).toEqual("thirdEntry");
                });

                it("check .toString() functionality", function() {
                    const testMap = state.myTestProperty.myMap;
                    const mapWithJsOutfit = new Map();
                    mapWithJsOutfit.set("firstEntry", { x: 10, y: 20 });
                    mapWithJsOutfit.set("secondEntry", { x: 30, y: 40 });
                    mapWithJsOutfit.set("thirdEntry", { x: 50, y: 60 });
                    expect(testMap.toString()).toEqual(mapWithJsOutfit.toString());
                });

                it("check .values() functionality", function() {
                    const valuesIterator = state.myTestProperty.myComplexMap.values();
                    expect(valuesIterator.next().value.x).toEqual(10);
                    expect(valuesIterator.next().value.x).toEqual(30);
                    expect(valuesIterator.next().value.x).toEqual(50);
                });

                it("should reflect remote changes", function() {
                    const myComplexMap = state.myTestProperty.myComplexMap;
                    expect(myComplexMap.size).toEqual(3);
                    rootNode.resolvePath("myTestProperty.myComplexMap").insert("fourthEntry",
                        PropertyFactory.create(vector2DTemplate.typeid, "single", { x: 70, y: 80 }));
                    expect(myComplexMap.size).toEqual(4);
                    expect(myComplexMap.get("fourthEntry").x).toEqual(70);
                    rootNode.resolvePath("myTestProperty.myComplexMap").remove("fourthEntry");
                    expect(myComplexMap.size).toEqual(3);
                });

                describe("Setting", function() {
                    afterEach(function() {
                        rootNode.resolvePath("myTestProperty.myComplexMap").clear();
                        rootNode.resolvePath("myTestProperty.myComplexMap").insert("firstEntry",
                            PropertyFactory.create(vector2DTemplate.typeid, "single", { x: 10, y: 20 }));
                        rootNode.resolvePath("myTestProperty.myComplexMap").insert("secondEntry",
                            PropertyFactory.create(vector2DTemplate.typeid, "single", { x: 30, y: 40 }));
                        rootNode.resolvePath("myTestProperty.myComplexMap").insert("thirdEntry",
                            PropertyFactory.create(vector2DTemplate.typeid, "single", { x: 50, y: 60 }));
                    });

                    it("check .clear() functionality", function() {
                        expect(rootNode.resolvePath("myTestProperty.myComplexMap").getIds().length).toEqual(3);
                        state.myTestProperty.myComplexMap.clear();
                        expect(rootNode.resolvePath("myTestProperty.myComplexMap").getIds().length).toEqual(0);
                    });

                    it("check .delete() functionality", function() {
                        expect(state.myTestProperty.myComplexMap.has("firstEntry")).toEqual(true);
                        expect(rootNode.get("myTestProperty").get("myComplexMap").has("firstEntry")).toEqual(true);
                        expect(state.myTestProperty.myComplexMap.delete("firstEntry")).toEqual(true);
                        expect(state.myTestProperty.myComplexMap.delete("nonExistingEntry")).toEqual(false);
                        expect(state.myTestProperty.myComplexMap.has("firstEntry")).toEqual(false);
                        expect(rootNode.get("myTestProperty").get("myComplexMap").has("firstEntry")).toEqual(false);
                    });

                    it("check .set() functionality", function() {
                        // replace entry
                        state.myTestProperty.myComplexMap.set("firstEntry",
                            PropertyFactory
                                .create("autodesk.appframework.tests:myVector2D-1.0.0", "single", { x: 7, y: 8 }));
                        expect(rootNode.resolvePath("myTestProperty.myComplexMap[firstEntry].x").getValue()).toEqual(7);
                        expect(rootNode.resolvePath("myTestProperty.myComplexMap[firstEntry].y").getValue()).toEqual(8);

                        // replace with polymorphic
                        state.myTestProperty.myComplexMap.set("firstEntry",
                            PropertyFactory.create(vector3DTemplate.typeid, "single", { x: 10, y: 20, z: 1 }));
                        expect(rootNode
                            .resolvePath("myTestProperty.myComplexMap[firstEntry].x").getValue()).toEqual(10);
                        expect(rootNode
                            .resolvePath("myTestProperty.myComplexMap[firstEntry].y").getValue()).toEqual(20);
                        expect(rootNode
                            .resolvePath("myTestProperty.myComplexMap[firstEntry].z").getValue()).toEqual(1);

                        // insert entry
                        state.myTestProperty.myComplexMap.set("fourthEntry", { x: 70, y: 80 });
                        expect(rootNode
                            .resolvePath("myTestProperty.myComplexMap[fourthEntry].x").getValue()).toEqual(70);
                        expect(rootNode
                            .resolvePath("myTestProperty.myComplexMap[fourthEntry].y").getValue()).toEqual(80);

                        // proxied property
                        state.myTestProperty.myComplexMap.set("fifthEntry",
                            PropertyProxy.proxify(PropertyFactory.create(vector2DTemplate.typeid, "single",
                                { x: 90, y: 100 })));
                        expect(rootNode
                            .resolvePath("myTestProperty.myComplexMap[fifthEntry].x").getValue()).toEqual(90);
                        expect(rootNode
                            .resolvePath("myTestProperty.myComplexMap[fifthEntry].y").getValue()).toEqual(100);

                        // polymorphic
                        state.myTestProperty.myComplexMap.set("sixthEntry",
                            PropertyFactory.create(vector3DTemplate.typeid, "single", { x: 110, y: 120, z: 1 }));
                        expect(rootNode
                            .resolvePath("myTestProperty.myComplexMap[sixthEntry].x").getValue()).toEqual(110);
                        expect(rootNode
                            .resolvePath("myTestProperty.myComplexMap[sixthEntry].y").getValue()).toEqual(120);
                        expect(rootNode
                            .resolvePath("myTestProperty.myComplexMap[sixthEntry].z").getValue()).toEqual(1);
                    });

                    it("should be possible to assign another MapProperty", function() {
                        state.myTestProperty.myComplexMap = state.constantCollections.nonPrimitiveMap;

                        const myComplexMap = rootNode.resolvePath("myTestProperty.myComplexMap");
                        expect(myComplexMap.getIds().length).toEqual(2);
                        expect(myComplexMap.get("a").get("x").getValue()).toEqual(42);
                        expect(myComplexMap.get("a").get("y").getValue()).toEqual(43);
                        expect(myComplexMap.get("b").get("x").getValue()).toEqual(44);
                        expect(myComplexMap.get("b").get("y").getValue()).toEqual(45);
                    });

                    it("should be possible to assign a new iterable", function() {
                        const checkAssignment = () => {
                            expect(rootNode.resolvePath("myTestProperty.myComplexMap[a].x").getValue()).toEqual(1);
                            expect(rootNode.resolvePath("myTestProperty.myComplexMap[a].y").getValue()).toEqual(2);
                            expect(rootNode.resolvePath("myTestProperty.myComplexMap[b].x").getValue()).toEqual(3);
                            expect(rootNode.resolvePath("myTestProperty.myComplexMap[b].y").getValue()).toEqual(4);
                            rootNode.resolvePath("myTestProperty.myComplexMap").clear();
                        };

                        // Assign pure javascript iterables
                        const entries: [string, Record<string, number>][] =
                            [["a", { x: 1, y: 2 }], ["b", { x: 3, y: 4 }]];
                        state.myTestProperty.myComplexMap = new Map(entries);
                        checkAssignment();

                        state.myTestProperty.myComplexMap = entries;
                        checkAssignment();

                        // Assign iterables of properties
                        const entriesAsProperties = (): [string, BaseProperty][] => [
                            [entries[0][0], PropertyFactory.create(vector2DTemplate.typeid, "single", entries[0][1])],
                            [entries[1][0], PropertyFactory.create(vector2DTemplate.typeid, "single", entries[1][1])],
                        ];

                        state.myTestProperty.myComplexMap = new Map(entriesAsProperties());
                        checkAssignment();

                        state.myTestProperty.myComplexMap = entriesAsProperties();
                        checkAssignment();
                    });
                });
            });

            describe("Map of collections", function() {
                it("should be able to access nested collection", function() {
                    expect(state.myGenericMap.size).toEqual(3);

                    // Nested array
                    expect(state.myGenericMap.get("array")[0]).toEqual(0);
                    expect(state.myGenericMap.get("array")[1]).toEqual(1);
                    expect(state.myGenericMap.get("array")[2]).toEqual(2);
                    expect(state.myGenericMap.get("array")[3]).toEqual(3);

                    // Nested map
                    expect(state.myGenericMap.get("map").get("a")).toEqual(0);
                    expect(state.myGenericMap.get("map").get("b")).toEqual(1);
                    expect(state.myGenericMap.get("map").get("c")).toEqual(2);

                    // Nested set
                    expect(state.myGenericMap.get("set").size).toEqual(2);
                });

                it("should be able to set entries of nested collections", function() {
                    state.myGenericMap.get("array")[0] = 84;
                    expect(rootNode.resolvePath("myGenericMap[array][0]")).toEqual(84);

                    state.myGenericMap.get("map").set("a", 85);
                    expect(rootNode.resolvePath("myGenericMap[map][a]")).toEqual(85);

                    // Assign primitive array property
                    state.myGenericMap.set("array", state.constantCollections.primitiveArray.getProperty().clone());
                    expect(rootNode.resolvePath("myGenericMap[array]").getLength()).toEqual(3);
                    expect(rootNode.resolvePath("myGenericMap[array][0]")).toEqual(42);
                    expect(rootNode.resolvePath("myGenericMap[array][1]")).toEqual(43);
                    expect(rootNode.resolvePath("myGenericMap[array][2]")).toEqual(44);

                    // Assign non-primitive array property
                    state.myGenericMap.set("array", state.constantCollections.nonPrimitiveArray.getProperty().clone());
                    expect(rootNode.resolvePath("myGenericMap[array]").getLength()).toEqual(2);
                    expect(rootNode.resolvePath("myGenericMap[array][0].x").getValue()).toEqual(42);
                    expect(rootNode.resolvePath("myGenericMap[array][0].y").getValue()).toEqual(43);
                    expect(rootNode.resolvePath("myGenericMap[array][1].x").getValue()).toEqual(44);
                    expect(rootNode.resolvePath("myGenericMap[array][1].y").getValue()).toEqual(45);

                    // Assign primitive map property
                    state.myGenericMap.set("map", state.constantCollections.primitiveMap.getProperty().clone());
                    expect(rootNode.resolvePath("myGenericMap[map]").getIds().length).toEqual(2);
                    expect(rootNode.resolvePath("myGenericMap[map][a]")).toEqual(42);
                    expect(rootNode.resolvePath("myGenericMap[map][b]")).toEqual(43);

                    // Assign non-primitive map property
                    state.myGenericMap.set("map", state.constantCollections.nonPrimitiveMap.getProperty().clone());
                    expect(rootNode.resolvePath("myGenericMap[map]").getIds().length).toEqual(2);
                    expect(rootNode.resolvePath("myGenericMap[map][a].x").getValue()).toEqual(42);
                    expect(rootNode.resolvePath("myGenericMap[map][a].y").getValue()).toEqual(43);
                    expect(rootNode.resolvePath("myGenericMap[map][b].x").getValue()).toEqual(44);
                    expect(rootNode.resolvePath("myGenericMap[map][b].y").getValue()).toEqual(45);

                    // Assign a set
                    state.myGenericMap.set("set", state.constantCollections.bookSet.getProperty().clone());
                    const setEntries = rootNode.resolvePath("myGenericMap[set]").getAsArray();
                    expect(setEntries.length).toEqual(2);
                    expect(setEntries[0].get("book").getValue()).toEqual("The Hobbit");
                    expect(setEntries[0].get("author").getValue()).toEqual("Tolkien");
                    expect(setEntries[1].get("book").getValue()).toEqual("Faust");
                    expect(setEntries[1].get("author").getValue()).toEqual("Goethe");
                });
            });
        });

        describe("Set", function() {
            afterEach(function() {
                rootNode.resolvePath("myTestProperty.myBookSet").clear();
                rootNode.resolvePath("myTestProperty.myBookSet").insert(
                    PropertyFactory.create(bookDataTemplate.typeid, "single",
                        { book: "Principia Mathematica", author: "Newton" }));
                rootNode.resolvePath("myTestProperty.myBookSet").insert(
                    PropertyFactory.create(bookDataTemplate.typeid, "single",
                        { book: "Chamber of Secrets", author: "Rowling" }));
                rootNode.resolvePath("myTestProperty.myBookSet").insert(
                    PropertyFactory.create(bookDataTemplate.typeid, "single",
                        { book: "Brief History of Time", author: "Hawking" }));
            });

            it("should return the size of the map using .size property", function() {
                const testSet = state.myTestProperty.myBookSet;
                expect(testSet.size).toEqual(3);
            });

            it("should be able to access the set using a for-of loop", function() {
                const testSet = state.myTestProperty.myBookSet;
                const tempArray: any[] = [];
                for (const value of testSet) {
                    tempArray.push(value);
                }
                expect(tempArray[0].book === "Principia Mathematica");
                expect(tempArray[0].author === "Newton");
                expect(tempArray[1].book === "Chamber of Secrets");
                expect(tempArray[1].author === "Rowling");
                expect(tempArray[2].book === "Brief History of Time");
                expect(tempArray[2].author === "Hawking");
            });

            it("should return true on `instanceOf` checks", function() {
                expect((state.myTestProperty.myBookSet instanceof Set)).toEqual(true);
            });

            it("check .add() functionality", function() {
                // Add object
                state.myTestProperty.myBookSet.add({ author: "Tolkien", book: "The Hobbit" });
                // Add property
                state.myTestProperty.myBookSet.add(PropertyFactory.create(bookDataTemplate.typeid, "single",
                    { author: "Goethe", book: "Faust" }));

                const bookSet = rootNode.get("myTestProperty").get("myBookSet").getAsArray();
                expect(bookSet[bookSet.length - 2].get("author").getValue()).toEqual("Tolkien");
                expect(bookSet[bookSet.length - 2].get("book").getValue()).toEqual("The Hobbit");
                expect(bookSet[bookSet.length - 1].get("author").getValue()).toEqual("Goethe");
                expect(bookSet[bookSet.length - 1].get("book").getValue()).toEqual("Faust");
            });

            it("check .clear() functionality", function() {
                expect(rootNode.resolvePath("myTestProperty.myBookSet").getIds().length).toEqual(3);
                state.myTestProperty.myBookSet.clear();
                expect(rootNode.resolvePath("myTestProperty.myBookSet").getIds().length).toEqual(0);
            });

            it("check .delete() functionality", function() {
                const myProperty = PropertyFactory.create(bookDataTemplate.typeid, "single",
                    { author: "Sagan", book: "Contact" });

                state.myTestProperty.myBookSet.add(myProperty);
                expect(rootNode.get("myTestProperty").get("myBookSet").has(myProperty.getId())).toEqual(true);
                expect(state.myTestProperty.myBookSet.has(myProperty)).toEqual(true);
                // Should be able to delete it
                expect(state.myTestProperty.myBookSet.delete(myProperty)).toEqual(true);
                // Should no longer be able to delete it
                expect(state.myTestProperty.myBookSet.delete(myProperty)).toEqual(false);
                expect(rootNode.get("myTestProperty").get("myBookSet").has(myProperty.getId())).toEqual(false);
                expect(state.myTestProperty.myBookSet.has(myProperty)).toEqual(false);
            });

            it("check .entries() functionality", function() {
                const entriesIterator = state.myTestProperty.myBookSet.entries();

                expect(entriesIterator.next().value[0].author).toEqual("Newton");
                expect(entriesIterator.next().value[0].author).toEqual("Rowling");
                expect(entriesIterator.next().value[0].author).toEqual("Hawking");
                expect(entriesIterator.next().done).toEqual(true);
            });

            it("check .forEach() functionality", function() {
                const testSet = state.myTestProperty.myBookSet;
                const tempArray: any[] = [];
                const testCallback = function(entry) {
                    tempArray.push(entry.book);
                    tempArray.push(entry.author);
                };
                testSet.forEach(testCallback);
                expect(tempArray[0]).toEqual("Principia Mathematica");
                expect(tempArray[1]).toEqual("Newton");
                expect(tempArray[2]).toEqual("Chamber of Secrets");
                expect(tempArray[3]).toEqual("Rowling");
                expect(tempArray[4]).toEqual("Brief History of Time");
                expect(tempArray[5]).toEqual("Hawking");
            });

            it("check .toString() functionality", function() {
                const testSet = state.myTestProperty.myBookSet;
                const setWithJsOutFit = new Set();
                expect(testSet.toString()).toEqual(setWithJsOutFit.toString());
            });

            it("check .values()/iterator functionality", function() {
                const testSet = state.myTestProperty.myBookSet;
                const tempArray: any[] = [];
                const iterator = testSet.values();
                for (let i = 0; i < testSet.size; i++) {
                    tempArray.push(iterator.next().value);
                    expect(typeof (tempArray[i].guid)).toEqual("string");
                }
                expect(tempArray[0].book).toEqual("Principia Mathematica");
                expect(tempArray[0].author).toEqual("Newton");
                expect(tempArray[1].book).toEqual("Chamber of Secrets");
                expect(tempArray[1].author).toEqual("Rowling");
                expect(tempArray[2].book).toEqual("Brief History of Time");
                expect(tempArray[2].author).toEqual("Hawking");
            });

            it("should reflect remote changes", function() {
                const myBookSet = state.myTestProperty.myBookSet;
                expect(myBookSet.size).toEqual(3);
                rootNode.resolvePath("myTestProperty.myBookSet").insert(
                    PropertyFactory
                        .create(bookDataTemplate.typeid, "single", { author: "Tolkien", book: "The Hobbit" }));
                expect(myBookSet.size).toEqual(4);
            });

            it("should be possible to assign a new iterable", function() {
                const checkAssignment = () => {
                    let foundHobbit = false;
                    let foundFaust = false;
                    rootNode.resolvePath("myTestProperty.myBookSet").getAsArray().forEach(function(value) {
                        if (value.get("book").getValue() === "The Hobbit") {
                            foundHobbit = true;
                            expect(value.get("author").getValue()).toEqual("Tolkien");
                        } else if (value.get("book").getValue() === "Faust") {
                            foundFaust = true;
                            expect(value.get("author").getValue()).toEqual("Goethe");
                        }
                    });
                    expect(foundHobbit).toEqual(true);
                    expect(foundFaust).toEqual(true);
                    expect(rootNode.resolvePath("myTestProperty.myBookSet").getIds().length).toEqual(2);
                    rootNode.resolvePath("myTestProperty.myBookSet").clear();
                    expect(rootNode.resolvePath("myTestProperty.myBookSet").getIds().length).toEqual(0);
                };

                // Assign pure javascript iterables
                const books = [{ author: "Tolkien", book: "The Hobbit" }, { author: "Goethe", book: "Faust" }];

                state.myTestProperty.myBookSet = new Set(books);
                checkAssignment();

                state.myTestProperty.myBookSet = books;
                checkAssignment();

                // Assign iterables of properties
                const booksAsProperties = () => [
                    PropertyFactory.create(bookDataTemplate.typeid, "single", books[0]),
                    PropertyFactory.create(bookDataTemplate.typeid, "single", books[1]),
                ];

                state.myTestProperty.myBookSet = new Set(booksAsProperties());
                checkAssignment();

                state.myTestProperty.myBookSet = booksAsProperties();
                checkAssignment();

                // Assign iterables of properties in the property tree should throw
                expect(() => {
                    state.myTestProperty.myBookSet = new Set([rootNode.get("myBook")]);
                }).toThrow();

                // Assigning a non-iterable should throw
                expect(() => { state.myTestProperty.myBookSet = booksAsProperties()[0]; }).toThrow(
                    "PropertyProxy-003");
            });
        });
    });
});

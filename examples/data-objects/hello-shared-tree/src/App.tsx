/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable unused-imports/no-unused-imports */
/* eslint-disable unicorn/prefer-string-slice */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable import/no-default-export */
/* eslint-disable import/no-internal-modules */
/* eslint-disable import/no-unassigned-import */
/* eslint-disable @typescript-eslint/no-floating-promises */

import {
    brand,
    SchemaData,
    emptyField,
    ValueSchema,
    EditableTree,
    Brand,
    Delta,
    fieldSchema,
    JsonableTree,
    FieldKey,
    Value,
    LocalFieldKey,
    rootFieldKey,
    rootFieldKeySymbol,
    ContextuallyTypedNodeData,
    FieldKinds,
    FieldSchema,
    FieldKindIdentifier,
    namedTreeSchema,
    singleTextCursor,
    typeNameSymbol,
    valueSymbol,
    TreeSchemaIdentifier,
    TreeSchema,
    TreeTypeSet,
    NamedTreeSchema,
    jsonableTreeFromCursor,
    BrandedType,
    ModularChangeset,
    on,
    getField,
    ISharedTree,
} from "@fluid-internal/tree";
import {
    DeltaVisitor,
    visitDelta,
    isLocalKey,
    ITreeCursorSynchronous,
    isGlobalFieldKey,
    ChangeFamilyEditor,
    FieldKindSpecifier,
} from "@fluid-internal/tree/dist/core";
import { DefaultChangeFamily, EditableField, EditManagerIndex, ForestIndex, SchemaIndex } from "@fluid-internal/tree/dist/feature-libraries";
import { SharedTreeCore } from "@fluid-internal/tree/dist/shared-tree-core";

import React, { useState, useEffect, useRef } from "react";
import "./App.css";
import { ChangeCategory, createCustomBinder, createPathBinder, createRootBinder } from "./binder";
import { initializeWorkspace, Workspace } from "./workspace";

const valueKeys: LocalFieldKey = brand("valueKeys");

const drawKeys: LocalFieldKey = brand("drawKeys");

export type Int32 = EditableTree & Brand<number, "myApp:Int32-1.0.0">;

export type Dice = EditableTree & Brand<{ valueKeys: Int32[]; }, "myApp:Dice-1.0.0">;

export type Draw = EditableTree & Brand<{ drawKeys: Dice[]; }, "myApp:Draw-1.0.0">;

const int32Schema = namedTreeSchema({
    name: brand("myApp:Int32-1.0.0"),
    value: ValueSchema.Number,
    globalFields: new Set(),
    extraLocalFields: emptyField,
    extraGlobalFields: false,
});

const diceSchema = namedTreeSchema({
    name: brand("myApp:Dice-1.0.0"),
    localFields: {
        [valueKeys]: fieldSchema(FieldKinds.sequence, [int32Schema.name]),
    },
    globalFields: new Set(),
    extraLocalFields: emptyField,
    extraGlobalFields: false,
    value: ValueSchema.Nothing,
});

const drawSchema = namedTreeSchema({
    name: brand("myApp:Draw-1.0.0"),
    localFields: {
        [drawKeys]: fieldSchema(FieldKinds.sequence, [diceSchema.name]),
    },
    globalFields: new Set(),
    extraLocalFields: emptyField,
    extraGlobalFields: false,
    value: ValueSchema.Nothing,
});

const appSchema: SchemaData = {
    treeSchema: new Map([
        [drawSchema.name, drawSchema],
        [diceSchema.name, diceSchema],
        [int32Schema.name, int32Schema]
    ]),
    globalFieldSchema: new Map([
        [rootFieldKey, fieldSchema(FieldKinds.optional, [drawSchema.name])],
    ]),
};

/**
 * Describes transitions from one state of the system to a new one, for instance updating the react state
 */
export type Transition<T> = (transitionFn: (prevState: T) => /* nextState */ T) => void;

/**
 * Transforms SharedTree operations into application state changes
 */
export interface OperationAdapter {
    transition: Transition<number[][]>;
    onChange: () => void;
    onBatch: () => void;
}


let countOnChange = 0;
let countOnBatch = 0;
export class DomainAdapterReact implements OperationAdapter {
    protected changed: boolean = false;
    constructor(
        public readonly transition: Transition<number[][]>,
        protected readonly workspace: Workspace,
    ) { }
    onChange(): void {
        console.log('onChange received', countOnChange++);
        this.changed = true;
    }
    onBatch(): void {
        console.log('Dispatch received', countOnBatch++);
        if (this.changed) {
            this.transition(prevRows => readDrawValues(this.workspace));
        }
        this.changed = false;
    }
}

export default function App() {
    const [workspace, setWorkspace] = useState<Workspace>();
    const [drawValues, setDrawValues] = useState<number[][]>([
        [-1, -1, -1, -1, -1],
        [-1, -1, -1, -1, -1],
        [-1, -1, -1, -1, -1]
    ]);
    const containerId = window.location.hash.substring(1) || undefined;

    useEffect(() => {
        async function initWorkspace() {
            const myWorkspace = await initializeWorkspace(containerId);
            const first = containerId === undefined;
            if (myWorkspace.containerId && first) {
                window.location.hash = myWorkspace.containerId;
            }
            setWorkspace(myWorkspace);
            myWorkspace.tree.storedSchema.update(appSchema);
            myWorkspace.tree.on("error", (event) => {
                console.log("Tree error received!");
            });

            if (first) {
                insertDrawValues(myWorkspace);
            }
            return myWorkspace;
        }
        initWorkspace().then((w) => {
            setDrawValues(readDrawValues(w));
            return w;
        }).then((w) => {
            // registerRootBinder(w, setDrawValues);
            // registerCustomBinder(w, setDrawValues);
            registerPathBinder(w, setDrawValues);

        });
    }, []);

    const all = () => {
        updateAllValues(workspace!);
    };

    const many = () => {
        updateDrawValues(workspace!);
    };

    const single = () => {
        updateSingleValue(workspace!);
    };

    // const register = () => {
    //     // registerRootBinder(workspace!, setDrawValues);
    //     // registerCustomBinder(workspace!, setDrawValues);
    //     // registerPathBinder(workspace!, setDrawValues);
    // };


    const deleteSingle = () => {
        deleteSingleValue(workspace!);
    };

    const deleteMany = () => {
        deleteDrawValues(workspace!);
    };

    const deleteAll = () => {
        deleteAllValues(workspace!);
    };


    return (
        <div className="App">
            <div className="dices">
                {
                    drawValues.map((values: number[], i: number) => <div className="dice" key={i}>{
                        values.map((value: number, j: number) => <span className="dice" key={j + j ** i}> {value}</span>)
                    }</div>)
                }
            </div>
            <div className="commit">
                {/* <span onClick={() => all()}>
                    U** &nbsp;
                </span>
                <span onClick={() => many()}>
                    U* &nbsp;
                </span> */}
                <span onClick={() => single()}>
                    U1 &nbsp;
                </span>
                {/* <span onClick={() => deleteAll()}>
                    D** &nbsp;
                </span>
                <span onClick={() => deleteMany()}>
                    D* &nbsp;
                </span> */}
                <span onClick={() => deleteSingle()}>
                    D1 &nbsp;
                </span>
                {/* <span onClick={() => register()}>
                    R1 &nbsp;
                </span> */}
            </div>
        </div>
    );
}

function typedInt32(json: JsonableTree): Int32 {
    return {
        [valueSymbol]: json.value,
        [typeNameSymbol]: int32Schema.name,
    } as unknown as Int32;
}

// ContextuallyTypedNodeData
function drawData(): Draw {
    const draws: Dice[] = [];
    for (let i = 0; i < 3; i++) {
        const dice: Dice = diceData();
        draws.push(dice);
    }
    return {
        [typeNameSymbol]: drawSchema.name,
        [drawKeys]: draws,
    } as unknown as Draw;
}

function diceData(): Dice {
    const dices: Int32[] = int32Data();
    return {
        [typeNameSymbol]: diceSchema.name,
        [valueKeys]: dices,
    } as unknown as Dice;
}

function int32Data() {
    const int32Array: Int32[] = [];
    for (let i = 0; i < 5; i++) {
        const newValue = rnd(100, 999);
        int32Array.push({
            [valueSymbol]: newValue,
            [typeNameSymbol]: int32Schema.name,
        } as unknown as Int32);
    }
    return int32Array;
}

function rnd(min: number, max: number) {
    return Math.floor(Math.random() * (max - min)) + min;
}

function insertDrawValues(workspace: Workspace) {
    const data: Draw = drawData();
    const tree = workspace.tree;
    tree.root = data;
}

function registerCustomBinder(workspace: Workspace, stateTransition: Transition<number[][]>) {
    const binder = createCustomBinder(workspace.tree);
    const reactAdapter = new DomainAdapterReact(stateTransition, workspace);
    binder.bindOnChange(ChangeCategory.LOCAL, () => reactAdapter.onChange());
    binder.bindOnBatch(() => reactAdapter.onBatch());
}

function registerPathBinder(workspace: Workspace, stateTransition: Transition<number[][]>) {
    const binder = createPathBinder(workspace.tree, appSchema, 'drawKeys[2]');
    const reactAdapter = new DomainAdapterReact(stateTransition, workspace);
    binder.bindOnChange(ChangeCategory.LOCAL, () => reactAdapter.onChange());
    binder.bindOnBatch(() => reactAdapter.onBatch());
}

function registerRootBinder(workspace: Workspace, stateTransition: Transition<number[][]>) {
    const binder = createRootBinder(workspace.tree);
    const reactAdapter = new DomainAdapterReact(stateTransition, workspace);
    binder.bindOnChange(ChangeCategory.SUBTREE, () => reactAdapter.onChange());
    binder.bindOnBatch(() => reactAdapter.onBatch());
}

function updateAllValues(workspace: Workspace) {
    const tree = workspace.tree;
    const draw: Draw = tree.root as Draw;
    const dicesIndex = draw.drawKeys.length - 1;
    if (dicesIndex > -1) {
        for (let i = 0; i <= dicesIndex; i++) {
            draw.drawKeys[i].valueKeys = int32Data();
        }
    } else insertDrawValues(workspace);
}

function updateDrawValues(workspace: Workspace) {
    const tree = workspace.tree;
    const draw: Draw = tree.root as Draw;
    const dicesIndex = draw.drawKeys.length - 1;
    if (dicesIndex > -1) {
        draw.drawKeys[dicesIndex].valueKeys = int32Data();
    } else insertDrawValues(workspace);
}

function updateSingleValue(workspace: Workspace) {
    const tree = workspace.tree;
    const draw: Draw = tree.root as Draw;
    const dicesIndex = draw.drawKeys.length - 1;
    if (dicesIndex > -1) {
        const valueIndex = draw.drawKeys[dicesIndex].valueKeys.length - 1;
        if (valueIndex > -1) {
            draw.drawKeys[dicesIndex].valueKeys[valueIndex] = {
                [valueSymbol]: rnd(100, 999),
                // [typeNameSymbol]: int32Schema.name,
            } as unknown as Int32;
        }
    } else insertDrawValues(workspace);
}

function deleteSingleValue(workspace: Workspace) {
    const tree = workspace.tree;
    const draw = tree.root!;
    const dicesField = draw[drawKeys];
    const dicesIndex = dicesField.length - 1;
    const dice = dicesField[dicesIndex];
    const valuesField = dice[valueKeys];
    const valueIndex = valuesField.length - 1;
    if (valueIndex > -1) {
        valuesField.deleteNodes(valueIndex, 1);
        if (valueIndex === 0 && dicesIndex > -1) {
            dicesField.deleteNodes(dicesIndex, 1);
        }
    }
}

function deleteDrawValues(workspace: Workspace) {
    const tree = workspace.tree;
    const draw = tree.root!;
    const dicesField = draw[drawKeys];
    const dicesIndex = dicesField.length - 1;
    if (dicesIndex > -1) {
        dicesField.deleteNodes(dicesIndex, 1);
    }
}

function deleteAllValues(workspace: Workspace) {
    const tree = workspace.tree;
    tree.root = {
        [typeNameSymbol]: drawSchema.name,
        [drawKeys]: [],
    } as unknown as Draw;
}

function readDrawValues(
    workspace: Workspace,
): number[][] {
    const tree = workspace.tree;
    const draw: Draw = tree.root as Draw;
    const dices: number[][] = [];
    for (const dice of draw.drawKeys) {
        const values: number[] = [];
        for (const value of dice.valueKeys) {
            values.push(value);
        }
        dices.push(values);
    }
    return dices;
}

function replacer(key, value) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return value instanceof Map ? {
        mapped: [...value.entries()],
    } : value;
}


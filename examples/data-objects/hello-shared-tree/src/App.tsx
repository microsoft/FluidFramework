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
    UpPath,
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

export class PathElem {
    constructor(
        public readonly parentIndex: number,
        public readonly fieldKey: LocalFieldKey,
        public readonly fieldKind: FieldKindSpecifier | undefined,
        public readonly fieldSchemaIdentifiers: ReadonlySet<TreeSchemaIdentifier>
    ) { }

    get typeArray(): TreeSchemaIdentifier[] {
        return [...this.fieldSchemaIdentifiers];
    }

    public equals(other: PathElem): boolean {
        return this.fieldKey === other.fieldKey;
    }
}

export class Path implements Iterable<PathElem>{
    protected readonly content: PathElem[] = [];
    get length(): number {
        return this.content.length;
    }
    push(pathElem: PathElem): Path {
        this.content.push(pathElem);
        return this;
    }
    get(index: number): PathElem {
        return this.content[index];
    }
    pop(): void {
        this.content.pop();
    }
    last(): PathElem {
        return this.content[this.content.length - 1];
    }
    [Symbol.iterator](): Iterator<PathElem> {
        let currentIndex = 0;
        const maxIndex = this.content.length;
        return {
            next: (): IteratorResult<PathElem> => {
                if (currentIndex < maxIndex) {
                    const result = { value: this.content[currentIndex], done: false };
                    currentIndex++;
                    return result;
                } else {
                    return { value: undefined, done: true };
                }
            }
        };
    }
    public equals(other: Path): boolean {
        if (this.length !== other.length)
            return false;

        for (let i = 0; i < this.content.length; i++) {
            const localElem: PathElem = this.content[i];
            const otherElem: PathElem = other.get(i);
            if (!localElem.equals(otherElem))
                return false;
        }
        return true;
    }
    toExpr(): string {
        return this.content.length > 0 ? this.content.map(pathElem => {
            const typeExpr = `(${pathElem.typeArray.join(',')})`;
            return `[${pathElem.parentIndex}].${pathElem.fieldKey}:${typeExpr}`;
        }).join('.') : 'root';
    }
}

export interface IndexedField {
    index: number;
    field: LocalFieldKey;
}

function buildSchemaPath(indexedFields: IndexedField[], schema: SchemaData): Path {
    const rootSchemaIdentifiers = schema.globalFieldSchema.get(rootFieldKey)?.types;
    let nextSchemaIdentifiers = rootSchemaIdentifiers;
    const out = new Path();
    label: for (const indexedField of indexedFields) {
        let found = false;
        if (nextSchemaIdentifiers !== undefined) {
            const nextSchemaIdentifiersExist = nextSchemaIdentifiers as ReadonlySet<TreeSchemaIdentifier>;
            for (const nextSchemaIdentifier of nextSchemaIdentifiersExist) {
                const treeSchema: TreeSchema | undefined = schema.treeSchema.get(nextSchemaIdentifier);
                if (treeSchema !== undefined) {
                    const localFieldSchema: FieldSchema | undefined = treeSchema.localFields.get(indexedField.field);
                    if (localFieldSchema !== undefined) {

                        out.push(new PathElem(
                            indexedField.index,
                            indexedField.field,
                            undefined,
                            nextSchemaIdentifiersExist
                        ));
                        nextSchemaIdentifiers = localFieldSchema?.types;
                        found = true;
                        continue label;
                    }
                }
            }
        }
        if (!found) throw new Error(`Path error, field ${indexedField.field} not found`);
    }
    return out;
}

export interface EditableTreeResolver {

    resolve(): Iterable<EditableTree>;
}

export interface ChangeBinder {

    bindOnChange(fn: () => void): () => void;
}

export interface BatchBinder {

    bindOnBatch(fn: () => void): () => void;
}


export class PathBasedResolver implements EditableTreeResolver {
    constructor(
        public readonly root: EditableField,
        public readonly path: Path,
        public readonly index: number,
    ) { }

    resolve(): Iterable<EditableTree> {
        let currentField = this.root;
        for (const pathElem of this.path) {
            currentField = currentField.getNode(pathElem.parentIndex)[getField](pathElem.fieldKey);
        }
        return [currentField.getNode(this.index)];
    }
}

export class SimpleBinder implements ChangeBinder, BatchBinder {
    constructor(
        public readonly sharedTree: ISharedTree,
        public readonly resolver: EditableTreeResolver,
    ) { }
    bindOnBatch(fn: () => void): () => void {
        const handle = this.sharedTree.events.on("afterBatch", () => fn());
        return () => handle();
    }
    bindOnChange(fn: () => void): () => void {
        const handles: (() => void)[] = [];
        const nodes = this.resolver.resolve();
        for (const node of nodes) {
            handles.push(node[on]("changing", () => fn()));
        }
        return () => {
            for (const handle of handles) {
                handle();
            }
        };
    }
}

/**
 * Describes transitions from one state of the system to a new one, for instance updating the react state
 */
export type TransitionState<T> = (transitionStateFn: (prevState: T) => /* nextState */ T) => void;

/**
 * Transforms SharedTree operations into application state changes
 */
export interface OperationAdapter {
    transitionState: TransitionState<number[][]>;
    onChange: () => void;
    onBatch: () => void;
}


let countOnChange = 0;
let countOnBatch = 0;
export class DomainAdapterReact implements OperationAdapter {
    protected changed: boolean = false;
    constructor(
        public readonly transitionState: TransitionState<number[][]>,
        protected readonly workspace: Workspace,
    ) { }
    onChange(): void {
        console.log('onChange received', countOnChange++);
        this.changed = true;
    }
    onBatch(): void {
        console.log('Dispatch received', countOnBatch++);
        if (this.changed) {
            this.transitionState(prevRows => readDrawValues(this.workspace));
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
            // registerNotification(w);
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

    const register = () => {
        const path: Path = buildSchemaPath([{ index: 0, field: drawKeys }], appSchema);
        const resolver: EditableTreeResolver = new PathBasedResolver(workspace!.tree.context.root, path, 2);
        const binder = new SimpleBinder(workspace!.tree, resolver);
        const reactAdapter = new DomainAdapterReact(setDrawValues, workspace!);
        binder.bindOnChange(() => reactAdapter.onChange());
        binder.bindOnBatch(() => reactAdapter.onBatch());
    };

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
                <span onClick={() => register()}>
                    R1 &nbsp;
                </span>
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

function updateAllValues(workspace: Workspace) {
    // console.log(`updateAllValues called`);
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
    // console.log(`updateManyValues called`);
    const tree = workspace.tree;
    const draw: Draw = tree.root as Draw;
    const dicesIndex = draw.drawKeys.length - 1;
    if (dicesIndex > -1) {
        draw.drawKeys[dicesIndex].valueKeys = int32Data();
    } else insertDrawValues(workspace);
}

function updateSingleValue(workspace: Workspace) {
    // console.log(`updateSingleValue called`);
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
    // console.log(`deleteSingleValue called`);
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
    // console.log(`deleteDrawValues called`);
    const tree = workspace.tree;
    const draw = tree.root!;
    const dicesField = draw[drawKeys];
    const dicesIndex = dicesField.length - 1;
    if (dicesIndex > -1) {
        dicesField.deleteNodes(dicesIndex, 1);
    }
}

function deleteAllValues(workspace: Workspace) {
    // console.log(`deleteRoot called`);
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


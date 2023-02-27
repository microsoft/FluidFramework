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
} from "@fluid-internal/tree";
import {
    DeltaVisitor,
    visitDelta,
    isLocalKey,
    ITreeCursorSynchronous,
    isGlobalFieldKey,
} from "@fluid-internal/tree/dist/core";
import { DefaultChangeFamily, DefaultChangeset, EditManagerIndex, ForestIndex, SchemaIndex } from "@fluid-internal/tree/dist/feature-libraries";
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
        public readonly fieldKind: FieldKindIdentifier | undefined,
        public readonly fieldSchemaIdentifiers: ReadonlySet<TreeSchemaIdentifier>
    ) { }

    get typeArray(): TreeSchemaIdentifier[] {
        return [...this.fieldSchemaIdentifiers];
    }

    public equals(other: PathElem): boolean {
        return this.fieldKey === other.fieldKey;
    }
}

export class Path {
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

enum Mode {
    Node = 1,
    Field = 2,
}

export class PathVisitor implements DeltaVisitor {
    protected readonly parentIndexVector: number[] = [];
    protected readonly path: Path = new Path();
    protected mode: Mode | undefined;
    constructor(
        protected readonly schemaData: SchemaData,
        protected readonly schemaIdentifiers: ReadonlySet<TreeSchemaIdentifier>
    ) {
        this.mode = undefined;
    }
    currentSchemaIdentifiers(): ReadonlySet<TreeSchemaIdentifier> {
        return this.path.length === 0 ?
            this.schemaIdentifiers : this.path.last().fieldSchemaIdentifiers;
    }
    onDelete(index: number, count: number): void { console.log('onDelete', index, count); }
    onInsert(index: number, content: readonly Delta.ProtoNode[]): void { console.log('onInsert'); }
    onMoveOut(index: number, count: number, id: Delta.MoveId): void { console.log('onMoveOut', index, count); }
    onMoveIn(index: number, count: number, id: Delta.MoveId): void { console.log('onMoveIn', index, count); }
    onSetValue(value: Value): void { console.log('onSetValue', value); }
    enterNode(index: number): void {
        this.mode = Mode.Node;
        this.parentIndexVector.push(index);
    }
    exitNode(index: number): void {
        this.mode = undefined;
        const foundIndex = this.parentIndexVector.pop();
        if (foundIndex !== index) throw new Error(`inconsistent parent index state; expected ${index} found ${foundIndex}`);
    }
    enterField(fieldKey: FieldKey): void {
        this.mode = Mode.Field;
        if (isLocalKey(fieldKey)) {
            const currentIdentifiers: ReadonlySet<TreeSchemaIdentifier> = this.currentSchemaIdentifiers();
            let localFieldSchema: FieldSchema | undefined;
            for (const currentIdentifier of currentIdentifiers) {
                const currentNamedTreeSchema: NamedTreeSchema = this.schemaData.treeSchema
                    .get(currentIdentifier)! as NamedTreeSchema;
                localFieldSchema = currentNamedTreeSchema.localFields.get(fieldKey);
                if (localFieldSchema !== undefined) {
                    break;
                }
            }
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            const fieldSchemaIdentifiers = localFieldSchema.types!;
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            const fieldKindIdentifier = localFieldSchema.kind;
            const parentIndex = this.parentIndexVector[this.parentIndexVector.length - 1];
            this.path.push(new PathElem(parentIndex, fieldKey, fieldKindIdentifier, fieldSchemaIdentifiers));
        } else if (isGlobalFieldKey(fieldKey) && fieldKey === rootFieldKeySymbol) {
            //
        }
    }
    exitField(fieldKey: FieldKey): void {
        if (isLocalKey(fieldKey)) {
            this.path.pop();
        } else if (isGlobalFieldKey(fieldKey) && fieldKey === rootFieldKeySymbol) {
            //
        }
        this.mode = undefined;
    }
}

export class DomainAdapter extends PathVisitor {

    constructor(
        protected readonly schemaData: SchemaData,
        protected readonly filter: Path,
        protected readonly schemaIdentifiers: ReadonlySet<TreeSchemaIdentifier>,
        protected readonly listener: DomainListener
    ) {
        super(schemaData, schemaIdentifiers);
    }
    onInsert(index: number, content: readonly Delta.ProtoNode[]): void {
        if (this.filter.equals(this.path)) {
            const jsonArray: JsonableTree[] = [];
            for (const node of content) {
                jsonArray.push(jsonableTreeFromCursor(node));
            }
            const values: Int32[] = jsonArray.map(json => typedInt32(json));
            const parentIndex = this.path.last().parentIndex;
            this.listener.onInsert(parentIndex, index, values);
        }
    }
    onDelete(index: number, count: number): void {
        if (this.filter.equals(this.path)) {
            const parentIndex = this.path.last().parentIndex;
            this.listener.onDelete(parentIndex, index, count);
        }
    }
}

export interface DomainListener {
    onDelete: (row: number, col: number, count: number) => void;
    onInsert: (row: number, col: number, values: Int32[]) => void;
}

export type Display = (fn: (drawValues: number[][]) => number[][]) => void;

export default function App() {
    const [workspace, setWorkspace] = useState<Workspace>();
    const [drawValues, setDrawValues] = useState<number[][]>([
        [-1, -1, -1, -1, -1],
        [-1, -1, -1, -1, -1],
        [-1, -1, -1, -1, -1]
    ]);
    const containerId = window.location.hash.substring(1) || undefined;

    /**
     * The domain listener updates now the UI
     */
    const drawListener: DomainListener = {
        onDelete(row: number, col: number, count: number): void {
            console.log(`DELETE at row:${row} col:${col} ${count} domain  values`);
            setDrawValues(
                rows => {
                    const newRows = rows.map(
                        (drawRow, drawRowIndex) => {
                            if (drawRowIndex === row)
                                drawRow.splice(col, count);
                            return drawRow;
                        });
                    for (const [drawRowIndex, drawRow] of newRows.entries()) {
                        if (drawRow !== undefined && drawRow.length === 0) {
                            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                            delete newRows[drawRowIndex];
                        }
                    }
                    return newRows;
                }
            );
        },
        onInsert(row: number, col: number, values: Int32[]): void {
            console.log(`INSERT at row:${row}, col:${col} ${values.length} domain values`);
            const numbers: number[] = values.map(value => value[valueSymbol] as number);
            setDrawValues(
                rows => rows.map(
                    (drawRow, drawRowIndex) => {
                        if (drawRowIndex === row)
                            drawRow.splice(col, numbers.length, ...numbers);
                        return drawRow;
                    })
            );
        }
    };

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
            const listenPath = buildSchemaPath([drawKeys, valueKeys], appSchema);
            registerPathOnIndex(myWorkspace, listenPath, drawListener);
            if (first) {
                insertDrawValues(myWorkspace);
            }
            return myWorkspace;
        }
        initWorkspace().then((w) => setDrawValues(readDrawValues(w)));
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

    const deleteSingle = () => {
        deleteSingleValue(workspace!);
    };

    const deleteMany = () => {
        deleteDrawValues(workspace!);
    };

    const deleteAll = () => {
        deleteAllValues(workspace!);
    };

    const registerPathOnIndex =
        (
            wrksp: Workspace,
            filter: Path,
            listener: DomainListener,
        ) => {
            (wrksp.tree as unknown as SharedTreeCore<DefaultChangeset,
                DefaultChangeFamily,
                [SchemaIndex, ForestIndex, EditManagerIndex<ModularChangeset, DefaultChangeFamily>]
            >).indexEventEmitter.on("newLocalState", (delta: Delta.Root) => {
                // console.log('Delta');
                // console.log(JSON.stringify(delta, replacer, 2));
                visitDelta(delta, new DomainAdapter(
                    appSchema,
                    filter,
                    new Set([drawSchema.name]),
                    listener));
            });
        };

    const registerPathOnEditableTreeContext =
        (
            wrksp: Workspace,
            filter: Path,
            listener: DomainListener,
        ) => {
            wrksp.tree.context.on("afterDelta", (delta: Delta.Root) => {
                console.log('Delta');
                // console.log(JSON.stringify(delta, replacer, 2));
                visitDelta(delta, new DomainAdapter(
                    appSchema,
                    filter,
                    new Set([drawSchema.name]),
                    listener));
            });
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
            </div>
        </div>
    );
}

function buildSchemaPath(fields: LocalFieldKey[], schema: SchemaData): Path {
    const rootSchemaIdentifiers = schema.globalFieldSchema.get(rootFieldKey)?.types;
    let nextSchemaIdentifiers = rootSchemaIdentifiers;
    const out = new Path();
    label: for (const field of fields) {
        let found = false;
        if (nextSchemaIdentifiers !== undefined) {
            const nextSchemaIdentifiersExist = nextSchemaIdentifiers as ReadonlySet<TreeSchemaIdentifier>;
            for (const nextSchemaIdentifier of nextSchemaIdentifiersExist) {
                const treeSchema: TreeSchema | undefined = schema.treeSchema.get(nextSchemaIdentifier);
                if (treeSchema !== undefined) {
                    const localFieldSchema: FieldSchema | undefined = treeSchema.localFields.get(field);
                    if (localFieldSchema !== undefined) {
                        out.push(new PathElem(0, field, undefined, nextSchemaIdentifiersExist));
                        nextSchemaIdentifiers = localFieldSchema?.types;
                        found = true;
                        continue label;
                    }
                }
            }
        }
        if (!found) throw new Error(`Path error, field ${field} not found`);
    }
    return out;
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


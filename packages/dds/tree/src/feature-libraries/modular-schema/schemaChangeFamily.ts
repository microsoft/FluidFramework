/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { ChangeEncoder, ChangeFamily, JsonCompatibleReadOnly, ProgressiveEditBuilder } from "../../change-family";
import { ChangeRebaser } from "../../rebase";
import {
    FieldSchema,
    GlobalFieldKey,
    LocalFieldKey,
    SchemaData,
    TreeSchema,
    TreeSchemaIdentifier,
} from "../../schema-stored";
import { AnchorSet, Delta, FieldKey } from "../../tree";
import { brand, Invariant, Multimap } from "../../util";
import { FieldChangeHandler, FieldChangeMap, FieldChangeset, NodeChangeset } from "./fieldChangeHandler";
import { FullSchemaPolicy } from "./fieldKind";

export class SchemaChangeFamily implements
    ChangeFamily<any, NodeChangeset>,
    ChangeRebaser<NodeChangeset>,
    ChangeEncoder<NodeChangeset> {
    _typeCheck?: Invariant<any> | undefined;

    constructor(
        readonly rootSchema: TreeSchemaIdentifier | undefined,
        readonly schemaData: SchemaData,
        readonly schemaPolicy: FullSchemaPolicy,
    ) { }

    get rebaser(): ChangeRebaser<any> { return this; }
    get encoder(): ChangeEncoder<any> { return this; }

    compose(changes: NodeChangeset[]): NodeChangeset {
        return this.composeI(this.rootSchema, changes);
    }

    private composeI(staticSchemaId: TreeSchemaIdentifier | undefined, changes: NodeChangeset[]): NodeChangeset {
        if (changes.length === 1) {
            return changes[0];
        }

        let schemaId = staticSchemaId;
        const fieldChanges = new Multimap<FieldKey, FieldChangeset>();
        for (const change of changes) {
            if (change.schema !== undefined) {
                schemaId = change.schema;
            }

            for (const key of Object.keys(change.fields)) {
                fieldChanges.add(brand(key), change.fields[key]);
            }
        }

        assert(schemaId !== undefined, "Need schema ID for root");
        const schema = this.getTreeSchema(schemaId);

        const composedFields: FieldChangeMap = {};
        for (const field of fieldChanges.keys()) {
            const childSchema = this.getChildSchema(schema, field);
            const composedField = this.getChangeHandler(schema, field).rebaser.compose(
                fieldChanges.get(field),
                (...childChanges) => this.composeI(childSchema, childChanges),
            );

            // TODO: Could optimize by checking that composedField is non-empty
            composedFields[field as string] = composedField;
        }

        const result: NodeChangeset = { fields: composedFields };
        if (staticSchemaId === undefined) {
            result.schema = schemaId;
        }
        return result;
    }

    invert(changes: NodeChangeset): NodeChangeset {
        return this.invertI(this.rootSchema, changes);
    }

    private invertI(staticSchemaId: TreeSchemaIdentifier | undefined, changes: NodeChangeset): NodeChangeset {
        const schemaId = staticSchemaId ?? changes.schema;
        assert(schemaId !== undefined, "Need schema ID for root");
        const schema = this.getTreeSchema(schemaId);

        const fields: FieldChangeMap = {};

        for (const field of Object.keys(changes.fields)) {
            const childSchema = this.getChildSchema(schema, brand(field));
            fields[field] = this.getChangeHandler(schema, brand(field)).rebaser.invert(
                changes.fields[field],
                (nodeChanges) => this.invertI(childSchema, nodeChanges));
        }

        const result: NodeChangeset = { fields };
        if (staticSchemaId === undefined) {
            result.schema = schemaId;
        }
        return result;
    }

    rebase(change: NodeChangeset, over: NodeChangeset): NodeChangeset {
        return this.rebaseI(this.rootSchema, change, over);
    }

    private rebaseI(
        staticSchemaId: TreeSchemaIdentifier | undefined,
        change: NodeChangeset,
        over: NodeChangeset,
    ): NodeChangeset {
        const schemaId = staticSchemaId ?? change.schema;
        assert(schemaId !== undefined, "Need schema ID for root");
        const schema = this.getTreeSchema(schemaId);

        const fields: FieldChangeMap = {};

        for (const field of Object.keys(change.fields)) {
            const baseChanges = over.fields[field];
            if (baseChanges === undefined) {
                fields[field] = change.fields[field];
            } else {
                const childSchema = this.getChildSchema(schema, brand(field));
                const rebasedField = this.getChangeHandler(schema, brand(field)).rebaser.rebase(
                    change.fields[field],
                    baseChanges,
                    (child, baseChild) => this.rebaseI(childSchema, child, baseChild));

                // TODO: Could optimize by checking that rebasedField is non-empty
                fields[field] = rebasedField;
            }
        }

        const result: NodeChangeset = { fields };
        if (staticSchemaId === undefined) {
            result.schema = schemaId;
        }
        return result;
    }

    rebaseAnchors(anchors: AnchorSet, over: NodeChangeset): void {
        anchors.applyDelta(this.intoDelta(over));
    }

    intoDelta(change: NodeChangeset): Delta.Root {
        return this.intoDeltaI(this.rootSchema, change);
    }

    private intoDeltaI(schemaId: TreeSchemaIdentifier | undefined, change: NodeChangeset): Delta.Root {
        const schemaIdFinal = change.schema ?? schemaId;
        assert(schemaIdFinal !== undefined, "Expected schema ID");
        const schema = this.getTreeSchema(schemaIdFinal);

        const delta: Delta.Root = new Map();
        for (const field of change.fields.keys()) {
            const childSchema = this.getChildSchema(schema, brand(field));
            const deltaField = this.getChangeHandler(schema, field).intoDelta(
                change.fields.get(field),
                (childChange) => this.intoDeltaI(childSchema, childChange),
            );
            delta.set(field, deltaField);
        }
        return delta;
    }

    buildEditor(deltaReceiver: (delta: Delta.Root) => void, anchors: AnchorSet): SchemaEditBuilder {
        return new SchemaEditBuilder(this, deltaReceiver, anchors);
    }

    public encodeForJson(formatVersion: number, change: NodeChangeset): JsonCompatibleReadOnly {
        return this.encodeForJsonI(formatVersion, this.rootSchema, change);
    }

    private encodeForJsonI(
        formatVersion: number,
        schemaId: TreeSchemaIdentifier | undefined,
        change: NodeChangeset,
    ): JsonCompatibleReadOnly {
        const schemaIdFinal = change.schema ?? schemaId;
        assert(schemaIdFinal !== undefined, "Expected schema ID");
        const schema = this.getTreeSchema(schemaIdFinal);

        const fields: FieldChangeMap = {};
        for (const field of Object.keys(change.fields)) {
            const childSchema = this.getChildSchema(schema, brand(field));
            fields[field] = this.getChangeHandler(schema, brand(field)).encoder.encodeForJson(
                formatVersion,
                change.fields[field],
                (childChange) => this.encodeForJsonI(formatVersion, childSchema, childChange),
            );
        }

        return {
            ...change,
            fields,
        };
    }

    public encodeBinary(formatVersion: number, change: NodeChangeset): Buffer {
        throw new Error("Method not implemented.");
    }

    public decodeJson(formatVersion: number, change: JsonCompatibleReadOnly): NodeChangeset {
        return this.decodeJsonI(formatVersion, this.rootSchema, change);
    }

    private decodeJsonI(
        formatVersion: number,
        schemaId: TreeSchemaIdentifier | undefined,
        encoded: JsonCompatibleReadOnly,
    ): NodeChangeset {
        const change = encoded as unknown as NodeChangeset;
        const schemaIdFinal = change.schema ?? schemaId;
        assert(schemaIdFinal !== undefined, "Expected schema ID");
        const schema = this.getTreeSchema(schemaIdFinal);

        const fields: FieldChangeMap = {};
        for (const field of Object.keys(change.fields)) {
            const childSchema = this.getChildSchema(schema, brand(field));
            fields[field] = this.getChangeHandler(schema, brand(field)).encoder.decodeJson(
                formatVersion,
                change.fields[field],
                (encodedChild) => this.decodeJsonI(formatVersion, childSchema, encodedChild),
            );
        }

        return {
            ...change,
            fields,
        };
    }

    public decodeBinary(formatVersion: number, change: Buffer): NodeChangeset {
        throw new Error("Method not implemented.");
    }

    private getChangeHandler(schema: TreeSchema, field: FieldKey): FieldChangeHandler<any> {
        // TODO: Check extra fields
        const fieldSchema = schema.localFields.get(field as LocalFieldKey)
            ?? this.fieldSchemaForGlobalField(schema, field as GlobalFieldKey);

        assert(fieldSchema !== undefined, "Unknown field key");
        const fieldKind = this.schemaPolicy.fieldKinds.get(fieldSchema.kind);
        assert(fieldKind !== undefined, "Unknown field kind");
        return fieldKind.changeHandler;
    }

    private getChildSchema(parentSchema: TreeSchema, field: FieldKey): TreeSchemaIdentifier | undefined {
        // TODO: Return child schema ID when known
        return undefined;
    }

    private getTreeSchema(schemaId: TreeSchemaIdentifier): TreeSchema {
        const schema = this.schemaData.treeSchema.get(schemaId);
        assert(schema !== undefined, "Unknown schema identifer)");
        return schema;
    }

    private fieldSchemaForGlobalField(schema: TreeSchema, key: GlobalFieldKey): FieldSchema | undefined {
        return (schema.globalFields.has(key))
            ? this.schemaData.globalFieldSchema.get(key)
            : undefined;
    }
}

export class SchemaEditBuilder extends ProgressiveEditBuilder<NodeChangeset> {
    constructor(
        family: SchemaChangeFamily,
        deltaReciever: (delta: Delta.Root) => void,
        anchors: AnchorSet,
    ) {
        super(family, deltaReciever, anchors);
    }

    // TODO: Finish implementation
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeEncoder, ChangeFamily, ProgressiveEditBuilder } from "../change-family";
import { ITreeCursor } from "../forest";
import { ChangeRebaser } from "../rebase";
import { FieldKindIdentifier } from "../schema-stored";
import { brand } from "../util";
import { AnchorSet, Delta, FieldKey, ITreeCursorSynchronous, UpPath, Value } from "../tree";
import {
    FieldKind,
    ModularChangeFamily,
    ModularEditBuilder,
    FieldChangeset,
    FieldChangeMap,
} from "./modular-schema";
import { forbidden, optional, sequence, value as valueFieldKind } from "./defaultFieldKinds";

export type DefaultChangeset = FieldChangeMap;

const defaultFieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind> = new Map(
    [valueFieldKind, optional, sequence, forbidden].map((f) => [f.identifier, f]),
);

/**
 * Implementation of {@link ChangeFamily} based on the default set of supported field kinds.
 *
 * @sealed
 */
export class DefaultChangeFamily implements ChangeFamily<DefaultEditBuilder, DefaultChangeset> {
    private readonly modularFamily: ModularChangeFamily;

    public constructor() {
        this.modularFamily = new ModularChangeFamily(defaultFieldKinds);
    }

    get rebaser(): ChangeRebaser<DefaultChangeset> {
        return this.modularFamily.rebaser;
    }

    get encoder(): ChangeEncoder<DefaultChangeset> {
        return this.modularFamily.encoder;
    }

    intoDelta(change: DefaultChangeset): Delta.Root<ITreeCursorSynchronous> {
        return this.modularFamily.intoDelta(change);
    }

    buildEditor(
        deltaReceiver: (delta: Delta.Root<ITreeCursorSynchronous>) => void,
        anchorSet: AnchorSet,
    ): DefaultEditBuilder {
        return new DefaultEditBuilder(this, deltaReceiver, anchorSet);
    }
}

export const defaultChangeFamily = new DefaultChangeFamily();

/**
 * Implementation of {@link ProgressiveEditBuilder} based on the default set of supported field kinds.
 * @sealed
 */
export class DefaultEditBuilder implements ProgressiveEditBuilder<DefaultChangeset> {
    private readonly modularBuilder: ModularEditBuilder;

    constructor(
        family: ChangeFamily<unknown, DefaultChangeset>,
        deltaReceiver: (delta: Delta.Root) => void,
        anchors: AnchorSet,
    ) {
        this.modularBuilder = new ModularEditBuilder(family, deltaReceiver, anchors);
    }

    public setValue(path: UpPath, value: Value): void {
        this.modularBuilder.setValue(path, value);
    }

    /**
     * @param parent - path to the parent node of the value field being edited
     * @param field - the value field which is being edited under the parent node
     * @returns An object with methods to edit the given field of the given parent.
     * The returned object can be used (i.e., have its methods called) multiple times but its lifetime
     * is bounded by the lifetime of this edit builder.
     */
    public valueField(parent: UpPath | undefined, field: FieldKey): ValueFieldEditBuilder {
        return {
            set: (newContent: ITreeCursor): void => {
                const change: FieldChangeset = brand(
                    valueFieldKind.changeHandler.editor.set(newContent),
                );
                this.modularBuilder.submitChange(parent, field, valueFieldKind.identifier, change);
            },
        };
    }

    /**
     * @param parent - path to the parent node of the optional field being edited
     * @param field - the optional field which is being edited under the parent node
     * @returns An object with methods to edit the given field of the given parent.
     * The returned object can be used (i.e., have its methods called) multiple times but its lifetime
     * is bounded by the lifetime of this edit builder.
     */
    public optionalField(parent: UpPath | undefined, field: FieldKey): OptionalFieldEditBuilder {
        return {
            set: (newContent: ITreeCursor | undefined, wasEmpty: boolean): void => {
                const change: FieldChangeset = brand(
                    optional.changeHandler.editor.set(newContent, wasEmpty),
                );
                this.modularBuilder.submitChange(parent, field, optional.identifier, change);
            },
        };
    }

    /**
     * @param parent - path to the parent node of the sequence field being edited
     * @param field - the sequence field which is being edited under the parent node
     * @returns An object with methods to edit the given field of the given parent.
     * The returned object can be used (i.e., have its methods called) multiple times but its lifetime
     * is bounded by the lifetime of this edit builder.
     */
    public sequenceField(parent: UpPath | undefined, field: FieldKey): SequenceFieldEditBuilder {
        return {
            insert: (index: number, newContent: ITreeCursor | ITreeCursor[]): void => {
                const change: FieldChangeset = brand(
                    sequence.changeHandler.editor.insert(index, newContent),
                );
                this.modularBuilder.submitChange(parent, field, sequence.identifier, change);
            },
            delete: (index: number, count: number): void => {
                const change: FieldChangeset = brand(
                    sequence.changeHandler.editor.delete(index, count),
                );
                this.modularBuilder.submitChange(parent, field, sequence.identifier, change);
            },
        };
    }

    /**
     * {@inheritDoc (ProgressiveEditBuilder:interface).getChanges}
     */
    public getChanges(): DefaultChangeset[] {
        return this.modularBuilder.getChanges();
    }
}

export interface ValueFieldEditBuilder {
    /**
     * Issues a change which replaces the current newContent of the field with `newContent`.
     * @param newContent - the new content for the field
     */
    set(newContent: ITreeCursor): void;
}

export interface OptionalFieldEditBuilder {
    /**
     * Issues a change which replaces the current newContent of the field with `newContent`
     * @param newContent - the new content for the field
     * @param wasEmpty - whether the field is empty when creating this change
     */
    set(newContent: ITreeCursor | undefined, wasEmpty: boolean): void;
}

export interface SequenceFieldEditBuilder {
    /**
     * Issues a change which inserts the `newContent` at the given `index`.
     * @param index - the index at which to insert the `newContent`.
     * @param newContent - the new content to be inserted in the field
     */
    insert(index: number, newContent: ITreeCursor | ITreeCursor[]): void;

    /**
     * Issues a change which deletes `count` elements starting at the given `index`.
     * @param index - The index of the first deleted element.
     * @param count - The number of elements to delete.
     */
    delete(index: number, count: number): void;
}

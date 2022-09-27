/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
    IChannel,
    IChannelAttributes,
    IChannelFactory,
    IChannelServices,
    IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions";
import { ISharedObject } from "@fluidframework/shared-object-base";
import { ICheckout, TransactionResult } from "../checkout";
import {
    defaultSchemaPolicy,
    EditableTreeContext,
    ForestIndex, ObjectForest,
    SchemaIndex,
    sequenceChangeFamily,
    SequenceChangeFamily,
    SequenceChangeset,
    SequenceEditBuilder,
    UnwrappedEditableField,
    getEditableTreeContext,
} from "../feature-libraries";
import { IForestSubscription } from "../forest";
import { StoredSchemaRepository } from "../schema-stored";
import { Index, SharedTreeCore } from "../shared-tree-core";
import { Checkout as TransactionCheckout, runSynchronousTransaction } from "../transaction";
import { Anchor, AnchorLocator, AnchorSet, UpPath } from "../tree";

/**
 * Collaboratively editable tree distributed data-structure,
 * powered by {@link @fluidframework/shared-object-base#ISharedObject}.
 *
 * See [the README](../../README.md) for details.
 */
export interface ISharedTree extends ICheckout<SequenceEditBuilder>, ISharedObject, AnchorLocator {
    /**
     * Root field of the tree.
     *
     * Currently this editable tree's fields do not update on edits,
     * so holding onto this root object across edits will only work if its an unwrapped node.
     * TODO: Fix this issue.
     *
     * Currently any access to this view of the tree may allocate cursors and thus require
     * `context.prepareForEdit()` before editing can occur.
     * TODO: Make this happen automatically.
     */
    readonly root: UnwrappedEditableField;

    /**
     * Context for controlling the EditableTree nodes produced from {@link ISharedTree.root}.
     *
     * TODO: Exposing access to this should be unneeded once editing APIs are finished.
     */
    readonly context: EditableTreeContext;
}

/**
 * Shared tree, configured with a good set of indexes and field kinds which will maintain compatibility over time.
 * TODO: node identifier index.
 *
 * TODO: detail compatibility requirements.
 * TODO: expose or implement Checkout.
 */
class SharedTree extends SharedTreeCore<SequenceChangeset, SequenceChangeFamily> implements ISharedTree {
    public readonly context: EditableTreeContext;
    public readonly forest: IForestSubscription;
    /**
     * Rather than implementing TransactionCheckout, have a member that implements it.
     * This allows keeping the `IEditableForest` private.
     */
    private readonly transactionCheckout: TransactionCheckout<SequenceEditBuilder, SequenceChangeset>;

    public constructor(
        id: string,
        runtime: IFluidDataStoreRuntime,
        attributes: IChannelAttributes,
        telemetryContextPrefix: string) {
            const anchors = new AnchorSet();
            const schema = new StoredSchemaRepository(defaultSchemaPolicy);
            const forest = new ObjectForest(schema, anchors);
            const indexes: Index<SequenceChangeset>[] = [
                new SchemaIndex(runtime, schema),
                new ForestIndex(runtime, forest),
            ];
            super(
                indexes,
                sequenceChangeFamily, anchors, id, runtime, attributes, telemetryContextPrefix,
                );

            this.forest = forest;
            this.transactionCheckout = {
                forest,
                changeFamily: this.changeFamily,
                submitEdit: (edit) => this.submitEdit(edit),
            };

            this.context = getEditableTreeContext(forest);
    }

    public locate(anchor: Anchor): UpPath | undefined {
        assert(this.editManager.anchors !== undefined, "editManager must have anchors")
        return this.editManager.anchors?.locate(anchor);
    }

    public get root(): UnwrappedEditableField {
        return this.context.root;
    }

    public runTransaction(transaction: (
        forest: IForestSubscription,
        editor: SequenceEditBuilder,
    ) => TransactionResult): TransactionResult {
        return runSynchronousTransaction(this.transactionCheckout, transaction);
    }
}

/**
 * A channel factory that creates {@link ISharedTree}s.
 */
 export class SharedTreeFactory implements IChannelFactory {
    public type: string = "SharedTree";

    public attributes: IChannelAttributes = {
        type: this.type,
        snapshotFormatVersion: "0.0.0",
        packageVersion: "0.0.0",
    };

    public async load(
        runtime: IFluidDataStoreRuntime,
        id: string,
        services: IChannelServices,
        channelAttributes: Readonly<IChannelAttributes>,
    ): Promise<IChannel> {
        const tree = new SharedTree(id, runtime, channelAttributes, "SharedTree");
        await tree.load(services);
        return tree;
    }

    public create(runtime: IFluidDataStoreRuntime, id: string): ISharedTree {
        const tree = new SharedTree(id, runtime, this.attributes, "SharedTree");
        tree.initializeLocal();
        return tree;
    }
}

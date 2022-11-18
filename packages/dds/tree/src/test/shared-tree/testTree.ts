/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { v4 as uuid } from "uuid";
import {
    AnchorSet,
    Commit,
    EditManager,
    IEditableForest,
    IForestSubscription,
    initializeForest,
    InMemoryStoredSchemaRepository,
    ITreeCursorSynchronous,
    mapCursorField,
    moveToDetachedField,
    SchemaPolicy,
    SeqNumber,
    SessionId,
    TransactionResult,
} from "../../core";
import { cursorToJsonObject, singleJsonCursor } from "../../domains";
import {
    DefaultChangeFamily,
    defaultChangeFamily,
    DefaultChangeset,
    DefaultEditBuilder,
    defaultSchemaPolicy,
    ObjectForest,
    runSynchronousTransaction,
} from "../../feature-libraries";
import { brand, JsonCompatible } from "../../util";

export interface TestTreeEdit {
    sessionId: SessionId;
    sessionEditNumber: number;
    refNumber: SeqNumber;
    changeset: DefaultChangeset;
}

export interface TestTreeOptions {
    sessionId?: string;
    state?: ITreeCursorSynchronous[] | ITreeCursorSynchronous;
    schemaPolicy?: SchemaPolicy;
}

/**
 * A command that cannot be aborted.
 */
export type SucceedingCommand = (forest: IForestSubscription, editor: DefaultEditBuilder) => void;

function commandWithResult(command: SucceedingCommand) {
    return (forest: IForestSubscription, editor: DefaultEditBuilder) => {
        command(forest, editor);
        return TransactionResult.Apply;
    };
}

export class TestTree {
    public readonly sessionId: string;
    public readonly forest: IEditableForest;
    public readonly builder: DefaultEditBuilder;
    public readonly editManager: EditManager<DefaultChangeset, DefaultChangeFamily>;
    public readonly schemaPolicy: SchemaPolicy;

    private refNumber: number = -1;
    private _localEditsApplied: number = 0;
    private _remoteEditsApplied: number = 0;

    public get localEditsApplied(): number {
        return this._localEditsApplied;
    }
    public get remoteEditsApplied(): number {
        return this._remoteEditsApplied;
    }

    public constructor(options: TestTreeOptions = {}) {
        const { state } = options;
        this.schemaPolicy = options.schemaPolicy ?? defaultSchemaPolicy;
        this.sessionId = options.sessionId ?? uuid();
        const schema = new InMemoryStoredSchemaRepository(this.schemaPolicy);
        this.forest = new ObjectForest(schema);
        if (state !== undefined) {
            initializeForest(this.forest, Array.isArray(state) ? state : [state]);
        }
        this.builder = new DefaultEditBuilder(
            defaultChangeFamily,
            (change) => {
                const delta = defaultChangeFamily.intoDelta(change);
                this.forest.applyDelta(delta);
            },
            new AnchorSet(),
        );
        this.editManager = new EditManager<DefaultChangeset, DefaultChangeFamily>(
            defaultChangeFamily,
        );
        this.editManager.initSessionId(this.sessionId);
    }

    public jsonRoots(): JsonCompatible[] {
        const reader = this.forest.allocateCursor();
        moveToDetachedField(this.forest, reader);
        const copy = mapCursorField(reader, cursorToJsonObject);
        reader.free();
        return copy;
    }

    public jsonRoot(): JsonCompatible {
        return this.jsonRoots()[0];
    }

    public fork(sessionId?: string): TestTree {
        return new TestTree({
            sessionId,
            schemaPolicy: this.schemaPolicy,
            // TODO: Use the forest's clone mechanism
            state: this.jsonRoots().map<ITreeCursorSynchronous>((r) => singleJsonCursor<any>(r)),
        });
    }

    public runTransaction(command: SucceedingCommand): TestTreeEdit {
        const trueCommand = commandWithResult(command);
        let changeset: DefaultChangeset | undefined;
        const checkout = {
            forest: this.forest,
            changeFamily: defaultChangeFamily,
            submitEdit: (change: DefaultChangeset): void => {
                changeset = change;
            },
        };
        const result = runSynchronousTransaction(checkout, trueCommand);
        assert(
            result === TransactionResult.Apply && changeset !== undefined,
            "The transaction should result in an edit being submitted",
        );
        const delta = this.editManager.addLocalChange(changeset);
        const resultingEdit: TestTreeEdit = {
            sessionId: this.sessionId,
            changeset,
            sessionEditNumber: this._localEditsApplied,
            refNumber: brand(this.refNumber),
        };
        this.forest.applyDelta(delta);
        this._localEditsApplied += 1;
        return resultingEdit;
    }

    public receive(edits: CommittedTestTreeEdit[] | CommittedTestTreeEdit): void {
        if (!Array.isArray(edits)) {
            this.receive([edits]);
            return;
        }
        for (const edit of edits) {
            const delta = this.editManager.addSequencedChange(edit);
            this.forest.applyDelta(delta);
            this._remoteEditsApplied += 1;
            this.refNumber = edit.seqNumber;
        }
    }
}

export type CommittedTestTreeEdit = TestTreeEdit & Commit<DefaultChangeset>;

export class Sequencer {
    private seqNumber: number = 0;

    public constructor() {}

    public order(edit: TestTreeEdit): CommittedTestTreeEdit;
    public order(edits: TestTreeEdit[]): CommittedTestTreeEdit[];
    public order(
        edits: TestTreeEdit | TestTreeEdit[],
    ): CommittedTestTreeEdit | CommittedTestTreeEdit[] {
        if (Array.isArray(edits)) {
            return edits.map((e) => this.order(e));
        }
        const edit: TestTreeEdit = edits;
        const commit: CommittedTestTreeEdit = {
            ...edit,
            seqNumber: brand(this.seqNumber),
        };
        this.seqNumber += 1;
        return commit;
    }
}

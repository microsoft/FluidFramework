/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IEvent } from "@fluidframework/common-definitions";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { SequenceDeltaEvent, SharedString } from "@fluidframework/sequence";

export interface ISharedStringHelperTextChangedEventArgs {
    isLocal: boolean;
    transformPosition: (oldPosition: number) => number;
}

export interface ISharedStringHelperEvents extends IEvent {
    (event: "textChanged", listener: (event: ISharedStringHelperTextChangedEventArgs) => void);
}

/**
 * Given a SharedString will provide a friendly API for use.
 */
export class SharedStringHelper extends TypedEventEmitter<ISharedStringHelperEvents> {
    private readonly _sharedString: SharedString;
    private _latestText: string;
    constructor(sharedString: SharedString) {
        super();
        this._sharedString = sharedString;
        this._latestText = this._sharedString.getText();
        this._sharedString.on("sequenceDelta", this.sequenceDeltaHandler);
    }

    public getText(): string {
        return this._latestText;
    }

    public insertText(text: string, pos: number): void {
        this._sharedString.insertText(pos, text);
    }

    public removeText(start: number, end: number): void {
        this._sharedString.removeText(start, end);
    }

    // consider hiding
    public replaceText(text: string, start: number, end: number) {
        this._sharedString.replaceText(start, end, text);
    }

    // Needs to update _latestText with the change and emit the event
    private readonly sequenceDeltaHandler = (event: SequenceDeltaEvent) => {
        const previousText = this._latestText;
        this._latestText = this._sharedString.getText();
        const isLocal = event.isLocal;

        const changeStartPosition = event.first.position;
        const changeEndPosition = event.last.position + event.last.segment.cachedLength;
        const charactersModifiedCount = this._latestText.length - previousText.length;

        const transformPosition = (oldPosition: number): number => {
            if (oldPosition <= changeStartPosition) {
                // Position is unmoved by the change if it is before the change
                return oldPosition;
            } else if (oldPosition > (changeEndPosition - 1)) {
                // Position is moved by the distance of the change if it is after the change
                return oldPosition + charactersModifiedCount;
            } else {
                // Position snaps to the left side of the change if it is fully encompassed by the change.
                // This should mean that a deletion occurred.
                return changeStartPosition;
            }
        };

        this.emit("textChanged", { isLocal, transformPosition });
    };
}

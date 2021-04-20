/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export class Note {
    public midiNumber: number;
    public noteType: NoteType;
    public customNoteLength?: number;

    constructor(midiNumber: number, noteType: NoteType, customNoteLength?: number) {
        this.midiNumber = midiNumber;
        this.noteType = noteType;
        this.customNoteLength = customNoteLength;
    }

    public static getBeatPercentage(note: Note): number {
        if (note.customNoteLength !== undefined) {
            return note.customNoteLength;
        }

        if (note.noteType === NoteType.whole) {
            return 4;
        } else if (note.noteType === NoteType.half) {
            return 2;
        } else if (note.noteType === NoteType.quarter) {
            return 1;
        } else if (note.noteType === NoteType.eighth) {
            return 0.5;
        } else if (note.noteType === NoteType.sixteenth) {
            return 0.25;
        }
        // default to quarter
        return 1;
    }
}

export enum NoteType {
    whole,
    half,
    quarter,
    eighth,
    sixteenth,
}

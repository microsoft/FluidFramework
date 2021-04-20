/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MidiNumbers } from "react-piano";
import { Song, restNoteMidiNumber } from "./Song";
import { Note, NoteType } from "./Note";

export const furEliseShort: Song = {
    noteSequence: [
        new Note(MidiNumbers.fromNote("E5"), NoteType.sixteenth),
        new Note(MidiNumbers.fromNote("D#5"), NoteType.sixteenth),

        new Note(MidiNumbers.fromNote("E5"), NoteType.sixteenth),
        new Note(MidiNumbers.fromNote("D#5"), NoteType.sixteenth),
        new Note(MidiNumbers.fromNote("E5"), NoteType.sixteenth),
        new Note(MidiNumbers.fromNote("B4"), NoteType.sixteenth),
        new Note(MidiNumbers.fromNote("D5"), NoteType.sixteenth),
        new Note(MidiNumbers.fromNote("C5"), NoteType.sixteenth),

        new Note(MidiNumbers.fromNote("A4"), NoteType.sixteenth),
        new Note(MidiNumbers.fromNote("E3"), NoteType.sixteenth),
        new Note(MidiNumbers.fromNote("A3"), NoteType.sixteenth),
        new Note(MidiNumbers.fromNote("C4"), NoteType.sixteenth),
        new Note(MidiNumbers.fromNote("E4"), NoteType.sixteenth),
        new Note(MidiNumbers.fromNote("A4"), NoteType.sixteenth),

        new Note(MidiNumbers.fromNote("B4"), NoteType.sixteenth),
        new Note(MidiNumbers.fromNote("E3"), NoteType.sixteenth),
        new Note(MidiNumbers.fromNote("G#3"), NoteType.sixteenth),
        new Note(MidiNumbers.fromNote("E4"), NoteType.sixteenth),
        new Note(MidiNumbers.fromNote("G#4"), NoteType.sixteenth),
        new Note(MidiNumbers.fromNote("B4"), NoteType.sixteenth),

        new Note(MidiNumbers.fromNote("C5"), NoteType.sixteenth),
        new Note(MidiNumbers.fromNote("E3"), NoteType.sixteenth),
        new Note(MidiNumbers.fromNote("A3"), NoteType.sixteenth),
        new Note(MidiNumbers.fromNote("E4"), NoteType.sixteenth),
        new Note(MidiNumbers.fromNote("E5"), NoteType.sixteenth),
        new Note(MidiNumbers.fromNote("D#5"), NoteType.sixteenth),

        new Note(MidiNumbers.fromNote("E5"), NoteType.sixteenth),
        new Note(MidiNumbers.fromNote("D#5"), NoteType.sixteenth),
        new Note(MidiNumbers.fromNote("E5"), NoteType.sixteenth),
        new Note(MidiNumbers.fromNote("B4"), NoteType.sixteenth),
        new Note(MidiNumbers.fromNote("D5"), NoteType.sixteenth),
        new Note(MidiNumbers.fromNote("C5"), NoteType.sixteenth),

        new Note(MidiNumbers.fromNote("A4"), NoteType.sixteenth),
        new Note(MidiNumbers.fromNote("E3"), NoteType.sixteenth),
        new Note(MidiNumbers.fromNote("A3"), NoteType.sixteenth),
        new Note(MidiNumbers.fromNote("C4"), NoteType.sixteenth),
        new Note(MidiNumbers.fromNote("E4"), NoteType.sixteenth),
        new Note(MidiNumbers.fromNote("A4"), NoteType.sixteenth),

        new Note(MidiNumbers.fromNote("B4"), NoteType.sixteenth),
        new Note(MidiNumbers.fromNote("E3"), NoteType.sixteenth),
        new Note(MidiNumbers.fromNote("G#3"), NoteType.sixteenth),
        new Note(MidiNumbers.fromNote("E4"), NoteType.sixteenth),
        new Note(MidiNumbers.fromNote("C5"), NoteType.sixteenth),
        new Note(MidiNumbers.fromNote("B4"), NoteType.sixteenth),

        new Note(MidiNumbers.fromNote("A4"), NoteType.sixteenth),
        new Note(restNoteMidiNumber, NoteType.sixteenth),
        new Note(restNoteMidiNumber, NoteType.sixteenth),
        new Note(restNoteMidiNumber, NoteType.sixteenth),
        new Note(restNoteMidiNumber, NoteType.sixteenth),
        new Note(restNoteMidiNumber, NoteType.sixteenth),
    ],
};

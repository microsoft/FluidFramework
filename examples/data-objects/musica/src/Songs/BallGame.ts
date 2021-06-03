/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MidiNumbers } from "react-piano";
import { Song, restNoteMidiNumber } from "./Song";
import { Note, NoteType } from "./Note";

export const ballGame: Song = {
    noteSequence: [
        new Note(MidiNumbers.fromNote("C4"), NoteType.half),
        new Note(MidiNumbers.fromNote("C5"), NoteType.quarter),
        new Note(MidiNumbers.fromNote("A4"), NoteType.quarter),
        new Note(MidiNumbers.fromNote("G4"), NoteType.quarter),
        new Note(MidiNumbers.fromNote("E4"), NoteType.quarter),
        new Note(MidiNumbers.fromNote("G4"), NoteType.half),
        new Note(restNoteMidiNumber, NoteType.quarter),
        new Note(MidiNumbers.fromNote("D4"), NoteType.half),
        new Note(restNoteMidiNumber, NoteType.quarter),

        new Note(MidiNumbers.fromNote("C4"), NoteType.half),
        new Note(MidiNumbers.fromNote("C5"), NoteType.quarter),
        new Note(MidiNumbers.fromNote("A4"), NoteType.quarter),
        new Note(MidiNumbers.fromNote("G4"), NoteType.quarter),
        new Note(MidiNumbers.fromNote("E4"), NoteType.quarter),
        new Note(MidiNumbers.fromNote("G4"), NoteType.whole),
        new Note(restNoteMidiNumber, NoteType.half),

        new Note(MidiNumbers.fromNote("A4"), NoteType.quarter),
        new Note(MidiNumbers.fromNote("G#4"), NoteType.quarter),
        new Note(MidiNumbers.fromNote("A4"), NoteType.quarter),
        new Note(MidiNumbers.fromNote("E4"), NoteType.quarter),
        new Note(MidiNumbers.fromNote("F4"), NoteType.quarter),
        new Note(MidiNumbers.fromNote("G4"), NoteType.quarter),

        new Note(MidiNumbers.fromNote("A4"), NoteType.half),
        new Note(MidiNumbers.fromNote("F4"), NoteType.quarter),
        new Note(MidiNumbers.fromNote("D4"), NoteType.half),
        new Note(restNoteMidiNumber, NoteType.quarter),

        new Note(MidiNumbers.fromNote("A4"), NoteType.half),
        new Note(MidiNumbers.fromNote("A4"), NoteType.quarter),
        new Note(MidiNumbers.fromNote("A4"), NoteType.quarter),
        new Note(MidiNumbers.fromNote("B4"), NoteType.quarter),
        new Note(MidiNumbers.fromNote("C5"), NoteType.quarter),

        new Note(MidiNumbers.fromNote("D5"), NoteType.quarter),
        new Note(MidiNumbers.fromNote("B4"), NoteType.quarter),
        new Note(MidiNumbers.fromNote("A4"), NoteType.quarter),
        new Note(MidiNumbers.fromNote("G4"), NoteType.quarter),
        new Note(MidiNumbers.fromNote("E4"), NoteType.quarter),
        new Note(MidiNumbers.fromNote("D4"), NoteType.quarter),

        new Note(MidiNumbers.fromNote("C4"), NoteType.half),
        new Note(MidiNumbers.fromNote("C5"), NoteType.quarter),
        new Note(MidiNumbers.fromNote("A4"), NoteType.quarter),
        new Note(MidiNumbers.fromNote("G4"), NoteType.quarter),
        new Note(MidiNumbers.fromNote("E4"), NoteType.quarter),
        new Note(MidiNumbers.fromNote("G4"), NoteType.half),
        new Note(restNoteMidiNumber, NoteType.quarter),
        new Note(MidiNumbers.fromNote("D4"), NoteType.half),
        new Note(MidiNumbers.fromNote("D4"), NoteType.quarter),

        new Note(MidiNumbers.fromNote("C4"), NoteType.half),
        new Note(MidiNumbers.fromNote("D4"), NoteType.quarter),
        new Note(MidiNumbers.fromNote("E4"), NoteType.quarter),
        new Note(MidiNumbers.fromNote("F4"), NoteType.quarter),
        new Note(MidiNumbers.fromNote("G4"), NoteType.quarter),
        new Note(MidiNumbers.fromNote("A4"), NoteType.half),
        new Note(restNoteMidiNumber, NoteType.quarter),

        new Note(restNoteMidiNumber, NoteType.quarter),
        new Note(MidiNumbers.fromNote("A4"), NoteType.quarter),
        new Note(MidiNumbers.fromNote("B4"), NoteType.quarter),

        new Note(MidiNumbers.fromNote("C5"), NoteType.half),
        new Note(restNoteMidiNumber, NoteType.quarter),
        new Note(MidiNumbers.fromNote("C5"), NoteType.half),
        new Note(restNoteMidiNumber, NoteType.quarter),

        new Note(MidiNumbers.fromNote("C5"), NoteType.quarter),
        new Note(MidiNumbers.fromNote("B4"), NoteType.quarter),
        new Note(MidiNumbers.fromNote("A4"), NoteType.quarter),
        new Note(MidiNumbers.fromNote("G4"), NoteType.quarter),
        new Note(MidiNumbers.fromNote("F#4"), NoteType.quarter),
        new Note(MidiNumbers.fromNote("G4"), NoteType.quarter),

        new Note(MidiNumbers.fromNote("A4"), NoteType.half),
        new Note(restNoteMidiNumber, NoteType.quarter),
        new Note(MidiNumbers.fromNote("B4"), NoteType.half),
        new Note(restNoteMidiNumber, NoteType.quarter),
        new Note(MidiNumbers.fromNote("C5"), NoteType.whole),
        new Note(restNoteMidiNumber, NoteType.half),
    ],
};

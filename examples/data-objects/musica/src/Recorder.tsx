/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedDirectory } from "@fluidframework/map";
import { Song } from "./Songs";
// eslint-disable-next-line import/no-internal-modules
import { Note } from "./Songs/Note";

export class Recorder {
    private currentSongName = "";
    private isRecording = false;
    private lastNoteTime = new Date();

    constructor(private readonly rootDir: ISharedDirectory) { }

    // Save each new note into Fluid as they come in
    public postSaveNewNote(note: Note, currentTempo: number) {
        if (this.isRecording) {
            const savedSongs = this.getSavedSongs();

            savedSongs.forEach((songProperties) => {
                if (songProperties.name === this.currentSongName) {
                    const lastLastNoteTime = this.lastNoteTime;
                    this.lastNoteTime = new Date();
                    const elapsedTimeInMs = this.lastNoteTime.getTime() - lastLastNoteTime.getTime();

                    const noteLength = (currentTempo * elapsedTimeInMs) / 60000;

                    const lastNote = songProperties.song.noteSequence.pop();

                    // This can be simpler by just storing the n-1 note info and pushing it when necessary.
                    // Also pushing the last note on stop
                    if (lastNote !== undefined) {
                        lastNote.customNoteLength = noteLength;
                        songProperties.song.noteSequence.push(lastNote);
                    }
                    songProperties.song.noteSequence.push(note);
                }
            });

            this.postSavedSongs(savedSongs);
        }
    }

    public getSavedSongs(): SongProperties[] {
        const savedSongs = this.rootDir.get("savedSongs");

        if (savedSongs === undefined) {
            return [];
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return savedSongs;
    }

    public postSavedSongs(savedSongs: SongProperties[]) {
        this.rootDir.set("savedSongs", savedSongs);
    }

    // For caching later
    private recordedSong: Song = { noteSequence: [] };

    public startRecording(name: string) {
        this.lastNoteTime = new Date();
        this.isRecording = true;
        this.currentSongName = name;
        this.recordedSong = { noteSequence: [] };

        const songProperties: SongProperties = { name: this.currentSongName, song: this.recordedSong };

        const savedSongs = this.getSavedSongs();
        savedSongs.push(songProperties);

        this.postSavedSongs(savedSongs);
    }

    public stopRecording() {
        this.isRecording = false;
        // Save recorded song to Fluid
    }
}

interface SongProperties {
    name: string;
    song: Song;
}

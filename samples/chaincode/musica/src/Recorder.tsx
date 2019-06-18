/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedMap } from '@prague/map';
import { Song } from './Songs';
import { Note } from './Songs/Note';

export class Recorder {
  private currentSongName = '';
  private isRecording = false;
  private lastNoteTime = new Date();

  constructor(private rootMap: ISharedMap) {}

  // Save each new note into Prague as they come in
  public postSaveNewNote(note: Note, currentTempo: number) {
    if (this.isRecording) {
      let savedSongs = this.getSavedSongs();

      savedSongs.forEach(songProperties => {
        if (songProperties.name === this.currentSongName) {
          let lastLastNoteTime = this.lastNoteTime;
          this.lastNoteTime = new Date();
          let elapsedTimeInMs = this.lastNoteTime.getTime() - lastLastNoteTime.getTime();

          let noteLength = (currentTempo * elapsedTimeInMs) / 60000;

          let lastNote = songProperties.song.noteSequence.pop();

          // This can be simpler by just storing the n-1 note info and pushing it when necessary. Also pushing the last note on stop
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
    let savedSongs = this.rootMap.get('savedSongs');

    if (savedSongs === undefined) {
      return [];
    }

    return savedSongs;
  }

  public postSavedSongs(savedSongs: SongProperties[]) {
    this.rootMap.set('savedSongs', savedSongs);
  }

  // for caching later
  private recordedSong: Song = { noteSequence: [] };

  public startRecording(name: string) {
    this.lastNoteTime = new Date();
    this.isRecording = true;
    this.currentSongName = name;
    this.recordedSong = { noteSequence: [] };

    let songProperties = { name: this.currentSongName, song: this.recordedSong } as SongProperties;

    let savedSongs = this.getSavedSongs();
    savedSongs.push(songProperties);

    this.postSavedSongs(savedSongs);
  }

  public stopRecording() {
    this.isRecording = false;
    // Save recorded song to prague
  }
}

interface SongProperties {
  name: string;
  song: Song;
}

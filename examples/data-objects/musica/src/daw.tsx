/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/order */

// See https://github.com/danigb/soundfont-player
// for more documentation on prop options.
import React from "react";

// Piano
import { KeyboardShortcuts, Piano } from "react-piano";
// eslint-disable-next-line import/no-unassigned-import
import "./styles.css";

// Player & Utility
import { pianoUtilityConstants } from "./PianoUtility";

// React widgets
import { DropdownList } from "react-widgets";
import Slider from "rc-slider";
// eslint-disable-next-line import/no-internal-modules, import/no-unassigned-import
import "react-widgets/dist/css/react-widgets.css";
// eslint-disable-next-line import/no-internal-modules, import/no-unassigned-import
import "rc-slider/assets/index.css";

import { ISharedDirectory } from "@fluidframework/map";
import { Instrument, NoteProperties, WaveProperties } from "./Player";
import { Recorder } from "./Recorder";
import { songLibrary, SongSelection } from "./SongLibrary";
// eslint-disable-next-line import/no-internal-modules
import { Note, NoteType } from "./Songs/Note";
// eslint-disable-next-line import/no-internal-modules
import { restNoteMidiNumber, Song } from "./Songs/Song";

const keyboardConfig = [
    // { natural: "q", flat: "1", sharp: "2" },
    // { natural: "w", flat: "2", sharp: "3" },
    // { natural: "e", flat: "3", sharp: "4" },
    // { natural: "r", flat: "4", sharp: "5" },
    // { natural: "t", flat: "5", sharp: "6" },
    // { natural: "y", flat: "6", sharp: "7" },
    // { natural: "u", flat: "7", sharp: "8" },
    // { natural: "i", flat: "8", sharp: "9" },
    // { natural: "o", flat: "9", sharp: "0" },
    // { natural: "p", flat: "0", sharp: "-" },
    // { natural: "[", flat: "-", sharp: "=" },
    // { natural: "z", flat: "a", sharp: "s" },
    // { natural: "x", flat: "s", sharp: "d" },
    // { natural: "c", flat: "d", sharp: "f" },
    // { natural: "v", flat: "f", sharp: "g" },
    // { natural: "b", flat: "g", sharp: "h" },
    // { natural: "n", flat: "h", sharp: "j" },
    // { natural: "m", flat: "j", sharp: "k" },
    // { natural: ",", flat: "k", sharp: "l" },
    // { natural: ".", flat: "l", sharp: ";" },
    // { natural: "/", flat: ";", sharp: """ },
    { natural: "a", flat: "q", sharp: "w" },
    { natural: "s", flat: "w", sharp: "e" },
    { natural: "d", flat: "e", sharp: "r" },
    { natural: "f", flat: "r", sharp: "t" },
    { natural: "g", flat: "t", sharp: "y" },
    { natural: "h", flat: "y", sharp: "u" },
    { natural: "j", flat: "u", sharp: "i" },
    { natural: "k", flat: "i", sharp: "o" },
    { natural: "l", flat: "o", sharp: "p" },
    { natural: ";", flat: "p", sharp: "[" },
    { natural: "'", flat: "[", sharp: "]" },
];

const keyboardShortcuts = KeyboardShortcuts.create({
    firstNote: pianoUtilityConstants.firstNote,
    lastNote: pianoUtilityConstants.lastNote,
    keyboardConfig,
});

// Instruments
const instrumentDropdownData = [
    { label: "Piano", id: Instrument.Piano },
    { label: "Guitar", id: Instrument.Guitar },
    { label: "Sine", id: Instrument.Sine },
    { label: "Organ", id: Instrument.Organ },
    { label: "Drumset", id: Instrument.Drumset },
    { label: "Custom", id: Instrument.Custom },
];

// Songs
const songDropdownData = [
    { label: "Für Elise", id: SongSelection.FurElise },
    { label: "Für Elise - Short", id: SongSelection.FurEliseShort },
    { label: "Ballgame", id: SongSelection.Ballgame },
    { label: "Sandstorm", id: SongSelection.Sandstorm },
];

const defaultCustomState = {
    customModulation: 0,
    customDecay: 0,
    overtone1: 0.7,
    overtone2: 0.15,
    overtone3: 0.06,
    overtone4: 0.03,
};

export interface DAWState {
    instrument: Instrument;
    songSelection: SongSelection;
    tempo: number;
    customModulation: number;
    customDecay: number;
    overtone1: number;
    overtone2: number;
    overtone3: number;
    overtone4: number;
    customInstrumentName: string;
    customSongName: string;
    songSelectionName: string;
    stopSong: boolean;
}

export interface DAWProps {
    rootDir: ISharedDirectory;
}

export class DAW extends React.Component<DAWProps, DAWState> {
    private readonly recorder;

    constructor(props: DAWProps) {
        super(props);
        this.state = {
            instrument: Instrument.Piano,
            songSelection: SongSelection.FurEliseShort,
            tempo: 120,
            customModulation: defaultCustomState.customModulation,
            customDecay: defaultCustomState.customDecay,
            overtone1: defaultCustomState.overtone1,
            overtone2: defaultCustomState.overtone2,
            overtone3: defaultCustomState.overtone3,
            overtone4: defaultCustomState.overtone4,
            customInstrumentName: "New Instrument",
            customSongName: "New Song",
            songSelectionName: songDropdownData[0].label,
            stopSong: false,
        };

        this.recorder = new Recorder(props.rootDir);
    }

    private readonly resetToDefault = () => {
        this.setState({
            customModulation: defaultCustomState.customModulation,
            customDecay: defaultCustomState.customDecay,
            overtone1: defaultCustomState.overtone1,
            overtone2: defaultCustomState.overtone2,
            overtone3: defaultCustomState.overtone3,
            overtone4: defaultCustomState.overtone4,
        });
    };

    private onTempoChange(tempo: number) {
        this.setState({ tempo });
    }

    private onModulationChange(customModulation) {
        this.setState({ customModulation });
    }

    private onDecayChange(customDecay) {
        this.setState({ customDecay });
    }

    private onOvertone1Change(overtone1) {
        this.setState({ overtone1 });
    }
    private onOvertone2Change(overtone2) {
        this.setState({ overtone2 });
    }
    private onOvertone3Change(overtone3) {
        this.setState({ overtone3 });
    }
    private onOvertone4Change(overtone4) {
        this.setState({ overtone4 });
    }

    /**
   * Triggered whenever the dropdown value is changed.
   */
    private onInstrumentChange(name: string, instrument: Instrument) {
        this.setState({ instrument });

        if (instrument === Instrument.Custom) {
            const savedInstruments = this.getSavedInstruments();

            savedInstruments.forEach((savedInstrument) => {
                if (savedInstrument.name === name) {
                    this.setState({
                        customDecay: savedInstrument.waveProperties.decay,
                        customModulation: savedInstrument.waveProperties.modulation,
                        overtone1: savedInstrument.waveProperties.overtone1,
                        overtone2: savedInstrument.waveProperties.overtone2,
                        overtone3: savedInstrument.waveProperties.overtone3,
                        overtone4: savedInstrument.waveProperties.overtone4,
                    });
                }
            });
        }
    }

    /**
   * Triggered whenever the dropdown value for song selection is changed.
   */
    private onSongSelectionChange(name: string, songSelection: SongSelection) {
        this.setState({ songSelection, songSelectionName: name });
    }

    public postPressKey(midiNumber: any) {
        this.recorder.postSaveNewNote(new Note(midiNumber, NoteType.quarter), this.state.tempo);

        this.props.rootDir.set<NoteProperties>("playNote", {
            length: 0.5,
            midiNumber,
            instrument: this.state.instrument,
            customModulation: this.state.customModulation,
            customDecay: this.state.customDecay,
            overtone1: this.state.overtone1,
            overtone2: this.state.overtone2,
            overtone3: this.state.overtone3,
            overtone4: this.state.overtone4,
        });
    }

    public postPlayNote(note: NoteProperties) {
        this.props.rootDir.set("playNote", note);
    }

    public postSaveInstrument(event: any) {
        const savedInstruments = this.getSavedInstruments();
        const waveProperties: WaveProperties = {
            amplitude: 1,
            frequency: 0,
            modulation: this.state.customModulation,
            decay: this.state.customDecay,
            overtone1: this.state.overtone1,
            overtone2: this.state.overtone2,
            overtone3: this.state.overtone3,
            overtone4: this.state.overtone4,
        };
        const instrumentProperty: InstrumentProperties = { name: this.state.customInstrumentName, waveProperties };

        savedInstruments.push(instrumentProperty);

        this.props.rootDir.set("savedInstruments", savedInstruments);
        event.preventDefault();
    }

    public getSavedInstruments(): InstrumentProperties[] {
        const savedInstruments = this.props.rootDir.get("savedInstruments");

        if (savedInstruments === undefined) {
            return [];
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return savedInstruments;
    }

    public postUnpressKey(midiNumber: any) {
        this.props.rootDir.set("stopNote", midiNumber);
    }

    private startPlaySong(loop: boolean) {
        let song: Song | undefined;

        if (this.state.songSelection === SongSelection.Custom) {
            const savedSongs = this.recorder.getSavedSongs();

            savedSongs.forEach((savedSong) => {
                if (savedSong.name === this.state.songSelectionName) {
                    song = savedSong.song;
                }
            });
        } else {
            song = songLibrary[this.state.songSelection];
        }

        if (song) {
            this.postPlaySong(song, 0, loop);
        }
    }

    private stopPlaySong() {
        this.setState({ stopSong: true });
    }

    /**
   * Recursively plays through the given song, starting at the given note index.
   */
    private postPlaySong(song: Song, noteIndex: number, loop: boolean) {
        let _noteIndex = noteIndex;
        if (this.state.stopSong) {
            this.setState({ stopSong: false });
            return;
        }

        if (_noteIndex >= song.noteSequence.length) {
            if (!loop) {
                return;
            }

            _noteIndex = 0;
        }

        const note = song.noteSequence[_noteIndex];
        const beatPercentage = Note.getBeatPercentage(note);
        const noteLengthSeconds = (60 / this.state.tempo) * beatPercentage;
        const noteLengthMs = noteLengthSeconds * 1000;

        if (note.midiNumber !== restNoteMidiNumber) {
            // It"s not a rest note - make a sound.
            const noteProperties: NoteProperties = {
                length: noteLengthSeconds,
                midiNumber: note.midiNumber,
                instrument: this.state.instrument,
                customModulation: this.state.customModulation,
                customDecay: this.state.customDecay,
                overtone1: this.state.overtone1,
                overtone2: this.state.overtone2,
                overtone3: this.state.overtone3,
                overtone4: this.state.overtone4,
            };

            // Play the note, and send the key unpress after note length time has elapsed.
            this.postPlayNote(noteProperties);
            setTimeout(() => this.postUnpressKey(note.midiNumber), noteLengthMs);
        }

        // Call this method to move to the next note after the current note is finished.
        setTimeout(() => this.postPlaySong(song, _noteIndex + 1, loop), noteLengthMs);
    }

    public render() {
        return (
            <div>
                <Piano
                    noteRange={{ first: pianoUtilityConstants.firstNote, last: pianoUtilityConstants.lastNote }}
                    playNote={(midiNumber) => {
                        this.postPressKey(midiNumber);
                    }}
                    stopNote={(midiNumber) => {
                        this.postUnpressKey(midiNumber);
                    }}
                    width={1000}
                    keyboardShortcuts={keyboardShortcuts}
                />
                <DropdownList
                    style={{ maxWidth: 150, marginTop: 20 }}
                    defaultValue={instrumentDropdownData[0].label}
                    data={this.getInstrumentDropdownData()}
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                    textField={(i) => i.label}
                    valueField="label"
                    onChange={(data) => this.onInstrumentChange(data.label, data.id)}
                />

                <div style={{ marginBottom: 20 }}>
                    <DropdownList
                        style={{ maxWidth: 200, marginTop: 20, display: "inline-block" }}
                        defaultValue={songDropdownData[0].label}
                        data={this.getSongDropdownData()}
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                        textField={(i) => i.label}
                        valueField="label"
                        onChange={(data) => this.onSongSelectionChange(data.label, data.id)}
                    />
                    <button style={{ marginLeft: 10, height: 36 }} onClick={() => this.startPlaySong(false)}>
                        Play song!
                    </button>
                    <button style={{ marginLeft: 10, height: 36 }} onClick={() => this.startPlaySong(true)}>
                        Loop song!
                    </button>
                    <button style={{ marginLeft: 10, height: 36 }} onClick={() => this.stopPlaySong()}>
                        Stop song!
                    </button>
                    <hr />
                    <label>
                        Name of song:
                        <input
                            type="text"
                            value={this.state.customSongName}
                            onChange={(event) => this.onCustomSongNameChange(event)}
                        />
                    </label>

                    <button
                        style={{ marginLeft: 10, height: 36 }}
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                        onClick={() => this.recorder.startRecording(this.state.customSongName)}
                    >
                        Start Recording!
                    </button>
                    <button style={{ marginLeft: 10, height: 36 }}
                            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                            onClick={() => this.recorder.stopRecording()}>
                        Stop Recording!
                    </button>
                    <hr />
                    <div style={{ margin: 10 }}>
                        <span>Tempo: </span>
                        <Slider
                            value={this.state.tempo}
                            onChange={(tempo) => this.onTempoChange(tempo)}
                            min={60}
                            max={200}
                            style={{ width: 200, display: "inline-block" }}
                        />
                        <span> {this.state.tempo}</span>
                    </div>

                    <this.ControlPanel />
                </div>
            </div>
        );
    }

    private readonly ControlPanel = () => (
        <div>
            <div className={this.state.instrument !== Instrument.Custom ? "hidden" : ""}>
                <div style={{ margin: 10 }}>
                    <span>Modulation: </span>
                    <Slider
                        value={this.state.customModulation}
                        onChange={(customModulation) => this.onModulationChange(customModulation)}
                        min={-10}
                        max={10}
                        step={0.1}
                        style={{ width: 200, display: "inline-block" }}
                    />
                    <span> {this.state.customModulation}</span>
                </div>
                <div style={{ margin: 10 }}>
                    <span>Decay: </span>
                    <Slider
                        value={this.state.customDecay}
                        onChange={(customDecay) => this.onDecayChange(customDecay)}
                        min={-10}
                        max={10}
                        step={0.1}
                        style={{ width: 200, display: "inline-block" }}
                    />
                    <span> {this.state.customDecay}</span>
                </div>
                <div style={{ margin: 10 }}>
                    <span>Overtone 1: </span>
                    <Slider
                        value={this.state.overtone1}
                        onChange={(overtone1) => this.onOvertone1Change(overtone1)}
                        min={0}
                        max={1}
                        step={0.01}
                        style={{ width: 200, display: "inline-block" }}
                    />
                    <span> {this.state.overtone1}</span>
                </div>
                <div style={{ margin: 10 }}>
                    <span>Overtone 2: </span>
                    <Slider
                        value={this.state.overtone2}
                        onChange={(overtone2) => this.onOvertone2Change(overtone2)}
                        min={0}
                        max={1}
                        step={0.01}
                        style={{ width: 200, display: "inline-block" }}
                    />
                    <span> {this.state.overtone2}</span>
                </div>
                <div style={{ margin: 10 }}>
                    <span>Overtone 3: </span>
                    <Slider
                        value={this.state.overtone3}
                        onChange={(overtone3) => this.onOvertone3Change(overtone3)}
                        min={0}
                        max={1}
                        step={0.01}
                        style={{ width: 200, display: "inline-block" }}
                    />
                    <span> {this.state.overtone3}</span>
                </div>
                <div style={{ margin: 10 }}>
                    <span>Overtone 4: </span>
                    <Slider
                        value={this.state.overtone4}
                        onChange={(overtone4) => this.onOvertone4Change(overtone4)}
                        min={0}
                        max={1}
                        step={0.01}
                        style={{ width: 200, display: "inline-block" }}
                    />
                    <span> {this.state.overtone4}</span>
                </div>
                <button onClick={this.resetToDefault}>Reset to default</button>
                <br />
                <br />

                <form onSubmit={(event) => this.postSaveInstrument(event)}>
                    <label>
                        Name:
                        <input
                            type="text"
                            value={this.state.customInstrumentName}
                            onChange={(event) => this.onCustomInstrumentNameChange(event)}
                        />
                    </label>
                    <input type="submit" value="Save Instrument" />
                </form>
            </div>
        </div>
    );

    private onCustomInstrumentNameChange(event) {
        this.setState({ customInstrumentName: event.target.value });
    }

    private onCustomSongNameChange(event) {
        this.setState({ customSongName: event.target.value });
    }

    private getInstrumentDropdownData(): { label: string; id: Instrument }[] {
        const dropDownData = [...instrumentDropdownData];
        this.getSavedInstruments().forEach((savedInstrument) => {
            dropDownData.push({ label: savedInstrument.name, id: Instrument.Custom });
        });

        return dropDownData;
    }

    private getSongDropdownData(): { label: string; id: SongSelection }[] {
        const dropDownData = [...songDropdownData];
        this.recorder.getSavedSongs().forEach((savedSong) => {
            dropDownData.push({ label: savedSong.name, id: SongSelection.Custom });
        });

        return dropDownData;
    }
}

interface InstrumentProperties {
    name: string;
    waveProperties: WaveProperties;
}

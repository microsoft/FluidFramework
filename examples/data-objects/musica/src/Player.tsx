/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const SAMPLERATE = 44100;
const PERIOD = 1 / SAMPLERATE;

export class Player {
    constructor(private readonly audioContext: AudioContext) { }

    public playNote(note: NoteProperties) {
        const frequency = Math.pow(2, (note.midiNumber - 69) / 12) * 440;
        const instrument = note.instrument;

        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        let waveProperties = {
            frequency,
        } as WaveProperties;

        // Drumset special case
        if (instrument === Instrument.Drumset) {
            this.playDrumsetNote(note.midiNumber, waveProperties);

            return;
        }

        // Custom waveforms for everything else
        if (instrument === Instrument.Sine) {
            waveProperties = {
                ...waveProperties,
                modulation: 0,
                decay: -2.2,
                overtone1: 0.7,
                overtone2: 0.15,
                overtone3: 0.06,
                overtone4: 0.035,
                amplitude: 1,
            };
        } else if (instrument === Instrument.Piano) {
            waveProperties = {
                ...waveProperties,
                modulation: -0.8,
                decay: -4.4,
                overtone1: 0.8,
                overtone2: 0.2,
                overtone3: 0.15,
                overtone4: 0.004,
                amplitude: 1,
            };
        } else if (instrument === Instrument.Guitar) {
            waveProperties = {
                ...waveProperties,
                modulation: 2.75,
                decay: -3,
                overtone1: 0.7,
                overtone2: 0.15,
                overtone3: 0.06,
                overtone4: 0.035,
                amplitude: 1,
            };
        } else if (instrument === Instrument.Organ) {
            waveProperties = {
                ...waveProperties,
                modulation: 2.5,
                decay: 3,
                overtone1: 0.7,
                overtone2: 0.15,
                overtone3: 0.1,
                overtone4: 0.02,
                amplitude: 1,
            };
        } else if (instrument === Instrument.Custom) {
            waveProperties = {
                ...waveProperties,
                /* eslint-disable @typescript-eslint/no-non-null-assertion */
                modulation: note.customModulation!,
                decay: note.customDecay!,
                overtone1: note.overtone1!,
                overtone2: note.overtone2!,
                overtone3: note.overtone3!,
                overtone4: note.overtone4!,
                /* eslint-enable @typescript-eslint/no-non-null-assertion */
                amplitude: 1,
            };
        }

        this.playNoteCustomWave(note.length, waveProperties, this.overtoneWave);
    }

    private playDrumsetNote(midiNumber: number, waveProperties: WaveProperties): any {
        switch (midiNumber) {
            case 48: {
                // Base
                const newWaveProperties = {
                    ...waveProperties,
                    frequency: 1,
                    amplitude: 10,
                    decay: -4,
                };
                this.playNoteCustomWave(0.5, newWaveProperties, this.bassWave);
                break;
            }
            case 49: {
                // Ride
                const newWaveProperties = {
                    ...waveProperties,
                    frequency: 1,
                    decay: -8,
                };
                this.playNoteCustomWave(0.5, newWaveProperties, this.rideWave);
                break;
            }
            case 50: {
                // Snare
                const newWaveProperties = {
                    ...waveProperties,
                    frequency: 1,
                    decay: -24,
                };
                this.playNoteCustomWave(0.5, newWaveProperties, this.snareWave);
                break;
            }
            case 52: {
                // Hi
                const newWaveProperties = {
                    ...waveProperties,
                    frequency: 1,
                    decay: -4,
                };
                this.playNoteCustomWave(0.4, newWaveProperties, this.hiWave);
                break;
            }
            case 53: {
                // Hat
                const newWaveProperties = {
                    ...waveProperties,
                    frequency: 1,
                    decay: -16,
                };
                this.playNoteCustomWave(0.5, newWaveProperties, this.hatWave);
                break;
            }
            default: {
                // Do nothing
            }
        }
    }

    private playNoteCustomWave(
        length: number,
        note: WaveProperties,
        customWave: (sampleIndex: number, waveProperties: WaveProperties) => number,
    ) {
        const buffer = this.audioContext.createBuffer(1, SAMPLERATE / note.frequency, SAMPLERATE);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < data.length; i++) {
            data[i] = customWave(i, note);
        }

        const osc = this.createBufferSource();
        osc.buffer = buffer;
        osc.loop = true;
        osc.start();
        osc.stop(this.audioContext.currentTime + length);
    }

    private readonly sineWave = (sampleIndex: number, note: WaveProperties): number => {
        const time = sampleIndex * PERIOD;

        if (note.modulation !== 0) {
            // eslint-disable-next-line max-len
            note.modulation = this.sineWave(sampleIndex, { ...note, modulation: 0 }) * note.modulation; // Why? Who knows.
        }

        return (
            // eslint-disable-next-line max-len
            note.amplitude * Math.exp(note.decay * time) * Math.sin(2 * Math.PI * note.frequency * time + note.modulation)
        );
    };

    private readonly overtoneWave = (sampleIndex: number, note: WaveProperties): number => {
        const overtoneWave =
            note.overtone1 * this.sineWave(sampleIndex, { ...note, frequency: note.frequency }) +
            note.overtone2 * this.sineWave(sampleIndex, { ...note, frequency: note.frequency * 2 }) +
            note.overtone3 * this.sineWave(sampleIndex, { ...note, frequency: note.frequency * 3 }) +
            note.overtone4 * this.sineWave(sampleIndex, { ...note, frequency: note.frequency * 4 });

        return overtoneWave;
    };

    private readonly snareWave = (sampleIndex: number, note: WaveProperties): number => {
        const time = sampleIndex * PERIOD;
        const snareWave = 3 * Math.exp(note.decay * time) * Math.random();
        return snareWave;
    };

    private readonly hiWave = (sampleIndex: number, note: WaveProperties): number => {
        const time = sampleIndex * PERIOD;
        const snareWave = ((Math.exp(note.decay * time) * 2 * sampleIndex) / (sampleIndex / 2 + 2)) * Math.random();
        return snareWave;
    };

    private readonly hatWave = (sampleIndex: number, note: WaveProperties): number => {
        const time = sampleIndex * PERIOD;
        const snareWave = ((Math.exp(note.decay * time) * 2 * sampleIndex) / (sampleIndex / 2 + 2)) * Math.random();
        return snareWave;
    };

    private readonly rideWave = (sampleIndex: number, note: WaveProperties): number => {
        const time = sampleIndex * PERIOD;
        const snareWave = (sampleIndex / (sampleIndex / 2) + 2) * Math.exp(note.decay * time) * Math.random();
        return snareWave;
    };

    private readonly bassWave = (sampleIndex: number, note: WaveProperties): number => {
        const time = sampleIndex * PERIOD;

        const modulationSin = 7 * Math.exp(note.decay * time) * Math.sin(2 * Math.PI * 15 * time);
        const modulatedSin =
            note.amplitude * (0.2 + Math.exp(note.decay * time) * Math.sin(2 * Math.PI * 15 * time + modulationSin));

        return modulatedSin;
    };

    private createBufferSource(): AudioBufferSourceNode {
        const osc = this.audioContext.createBufferSource();

        const gain = this.audioContext.createGain();
        gain.gain.value = 0.1;

        osc.connect(gain);
        gain.connect(this.audioContext.destination);

        return osc;
    }
}

export enum Instrument {
    Sine,
    Piano,
    Guitar,
    Organ,
    Drumset,
    Custom,
}

export interface WaveProperties {
    amplitude: number;
    frequency: number;
    modulation: number;
    decay: number;
    overtone1: number;
    overtone2: number;
    overtone3: number;
    overtone4: number;
}

// Properties sent over Fluid
export interface NoteProperties {
    length: number;
    midiNumber: number;
    instrument: Instrument;
    customModulation?: number; // Used with custom instrument
    customDecay?: number; // Used with custom instrument
    overtone1?: number;
    overtone2?: number;
    overtone3?: number;
    overtone4?: number;
}

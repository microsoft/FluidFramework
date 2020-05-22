/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// Fluid
import {
    ContainerRuntimeFactoryWithDefaultComponent,
    PrimedComponent,
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";
import { IComponentHTMLView } from "@fluidframework/view-interfaces";

// React
import * as React from "react";
import * as ReactDOM from "react-dom";

// Player & Utility
import { Player, NoteProperties } from "./Player";
import { PianoUtility } from "./PianoUtility";
import { DAW } from "./daw";

const musicaName = "@fluid-example/musica";

// TODO: Is this right?
const audioContext = new AudioContext();

export class Musica extends PrimedComponent implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    protected async componentHasInitialized() {
        this.player = new Player(audioContext);
    }

    private player: Player | undefined;

    public render(div: HTMLDivElement) {
        const reactRender = () => {
            // TODO: DAW and Recorder logic and visuals can be fully seperated and just both called here
            // I think their only tie together is tempo, which isn"t DAW related either so tempo may
            // have to be updated in here as a global
            ReactDOM.render(<DAW rootDir={this.root} />, div);
        };

        reactRender();

        this.root.on("op", (op) => {
            this.onOp(op);
            reactRender();
        });
    }

    /**
   * Invoked anytime a value changes in the root directory.
   */
    private onOp(op: any) {
        const contents = op.contents;
        if (contents.key === "playNote") {
            const noteProperties = contents.value.value as NoteProperties;
            const clientId = op.clientId;
            this.execPressKey(noteProperties, clientId);
        } else if (contents.key === "stopNote") {
            const midiNumber: number = contents.value.value;
            this.execUnpressKey(midiNumber);
        }
    }

    private execUnpressKey(midiNumber: number) {
        this.execStopNote(midiNumber);

        const key = PianoUtility.findKeyFromMidiNumber(midiNumber);
        if (key === undefined) {
            return;
        }
        // TODO: Only update visuals on unpress except for when local client is holding it down.
        PianoUtility.updateKeyVisualForUnpressed(key);
    }

    /**
   * Applies the given setting to the key corresponding to the given midi number.
   */
    private execPressKey(note: NoteProperties, clientId: string) {
        // Make the sound.
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.player!.playNote(note);

        // Update visuals.
        const key = PianoUtility.findKeyFromMidiNumber(note.midiNumber);
        if (key === undefined) {
            return;
        }
        PianoUtility.updateKeyVisualForPressed(key, clientId);
    }

    /**
   * Stops the note for the given midi number.
   */
    private execStopNote(_midiNumber: number) {
        // TODO: Stop the sound.
    }
}

export const MusicaInstantiationFactory = new PrimedComponentFactory(
    musicaName,
    Musica,
    [],
    {},
);

export const fluidExport = new ContainerRuntimeFactoryWithDefaultComponent(
    musicaName,
    new Map([
        [musicaName, Promise.resolve(MusicaInstantiationFactory)],
    ]),
);

// Prague
import { Component, Document } from '@prague/app-component';
import { IContainerContext, IRuntime } from '@prague/container-definitions';

// React
import * as React from 'react';
import * as ReactDOM from 'react-dom';

// Player & Utility
import { Player, NoteProperties } from './Player';
import { PianoUtility } from './PianoUtility';
import { DAW } from './DAW';

// TODO: Is this right?
const audioContext = new AudioContext();

export class Musica extends Document {
  constructor() {
    super();
    this.player = new Player(audioContext);
  }

  private player: Player;
  /**
   * Create the component's schema and perform other initialization tasks
   * (only called when document is initially created).
   */
  protected async create() {}

  protected render(host: HTMLDivElement) {
    // TODO: DAW and Recorder logic and visuals can be fully seperated and just both called here
    // I think their only tie together is tempo, which isn't DAW related either so tempo may have to be updated in here as a global
    ReactDOM.render(<DAW rootMap={this.root} />, host);
  }

  /**
   *  The component has been loaded. Render the component into the provided div
   * */
  public async opened() {
    await this.connected;

    const maybeDiv = await this.platform.queryInterface<HTMLDivElement>('div');
    if (maybeDiv) {
      this.render(maybeDiv);
      this.root.on('op', op => {
        this.onOp(op);
        this.render(maybeDiv);
      });
    } else {
      return;
    }
  }

  /**
   * Invoked anytime a value changes in the root map.
   */
  private onOp(op: any) {
    const contents = op.contents;
    if (contents.key === 'playNote') {
      let noteProperties = contents.value.value as NoteProperties;
      const clientId = op.clientId;
      this.execPressKey(noteProperties, clientId);
    } else if (contents.key === 'stopNote') {
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
    this.player.playNote(note);

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

export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
  return Component.instantiateRuntime(
    context,
    '@chaincode/clicker',
    new Map([['@chaincode/clicker', Promise.resolve(Component.createComponentFactory(Musica))]])
  );
}
//CSPELL:ignore Unpress chaincode Musica

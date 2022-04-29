/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MidiNumbers } from "react-piano";

// Constants
const activeKeyClassName = "ReactPiano__Key--active";
const keyQuerySelector = ".ReactPiano__Key";
const firstNote = MidiNumbers.fromNote("c3");
const lastNote = MidiNumbers.fromNote("f5");

const presenceColors = [
    "#8B0400" /* maroon */,
    "#BF5D24" /* orange */,
    "#E6AF1F" /* gold */,
    "#95A84F" /* olive green */,
    "#4AA02C" /* Leevi"s favorite color!! */,
    "#599E8E" /* seafoam green */,
    "#C791CB" /* light blue */,
    "#E73B65" /* pink */,
];

// Exports
export const pianoUtilityConstants = { firstNote, lastNote };
export enum KeyStatus {
    Pressed,
    Unpressed,
}

/**
 * Utility class for the Piano module.
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class PianoUtility {
    /**
     * Finds the HTML element for the key corresponding to the given midi number.
     */
    public static findKeyFromMidiNumber(midiNumber: number): HTMLElement {
        const allKeys = document.querySelectorAll(keyQuerySelector);
        const index = midiNumber - firstNote;

        return allKeys[index] as HTMLElement;
    }

    /**
     * Gets the status for the key.
     */
    public static getKeyStatus(key: HTMLElement): KeyStatus {
        if (key.classList.contains(activeKeyClassName)) {
            return KeyStatus.Pressed;
        } else {
            return KeyStatus.Unpressed;
        }
    }

    /**
     * Updates the visuals for the given key so it looks pressed.
     */
    public static updateKeyVisualForPressed(key: HTMLElement, clientId: string) {
        key.classList.add(activeKeyClassName);

        // Add presence-specific color.
        const colorIndex = PianoUtility.getColorIndexFromClientId(clientId);
        const color: string = presenceColors[colorIndex];
        key.style.background = color;
        key.style.border = `px solid ${color}`;
    }

    private static getColorIndexFromClientId(clientId: string): number {
        return Math.abs(PianoUtility.hashCode(clientId)) % presenceColors.length;
    }

    private static hashCode(str: string): number {
        let hash = 0;
        let i;
        let chr;
        if (str.length === 0) { return hash; }
        for (i = 0; i < str.length; i++) {
            chr = str.charCodeAt(i);
            // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
            hash = (hash << 5) - hash + chr;
            hash |= 0; // Convert to 32bit integer
        }
        return hash;
    }

    /**
     * Updates the visuals for the given key so it looks unpressed.
     */
    public static updateKeyVisualForUnpressed(key: HTMLElement) {
        key.classList.remove(activeKeyClassName);

        // Reset background color.
        key.style.background = "";
        key.style.border = "";
    }

    public static getPresenceColorId(): number {
        const randomIndex: number = Math.floor(Math.random() * Math.floor(presenceColors.length));
        return randomIndex;
    }
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Song, furElise, sandstorm, furEliseShort, ballGame } from "./Songs";

export enum SongSelection {
    FurElise,
    FurEliseShort,
    Sandstorm,
    Ballgame,
    Custom,
}

// TODO:NIT: how do you initialize this in place
export const songLibrary: Song[] = [];
songLibrary[SongSelection.FurElise] = furElise;
songLibrary[SongSelection.FurEliseShort] = furEliseShort;
songLibrary[SongSelection.Sandstorm] = sandstorm;
songLibrary[SongSelection.Ballgame] = ballGame;

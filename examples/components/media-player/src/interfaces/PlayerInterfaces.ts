/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */


export const PlayerStateKey = "playerState";
export const PlayerProgressKey = "playerProgress";
export const PlaylistKey = "playlist";
export const PlaylistIndexKey = "playlistIndex";
export const PlayerProgressProportionKey = "playerProgressProportion";
export const AcceptableDelta = 5;
export const InitialBuffer = 2;

export enum PlayerState {
    Playing = "Playing",
    Paused = "Paused",
    Buffering = "Buffering",
    Seeking = "Seeking"
}

export enum MediaSource {
    Youtube,
    Soundcloud,
    Vimeo,
    Twitch
}

export interface IPlaylistItem {
    name: string;
    url: string;
    id: string;
    thumbnailUrl: string;
    channelName: string;
    description: string;
    mediaSource: MediaSource;
}

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

declare global {
    interface Window {
        onYouTubeIframeAPIReady?: () => void;
        YT: any;
    }
}

export enum PlayerState {
    unstarted = -1,
    ended,
    playing,
    paused,
    buffering,
    unknown,
    cued,
}

export function mapToPlayerState(YTState: number): PlayerState {
    switch (YTState) {
        case -1:
            return PlayerState.unstarted;
        case 0:
            return PlayerState.ended;
        case 1:
            return PlayerState.playing;
        case 2:
            return PlayerState.paused;
        case 3:
            return PlayerState.buffering;
        case 5:
        default:
            return PlayerState.unknown;
    }
}

export function getProposedPlaybackTime(lastChangeUTC: number, playing: boolean, elapsedTime: number): number {
    if (playing) {
        return (Date.now() - lastChangeUTC + elapsedTime * 1000) / 1000;
    } else {
        return elapsedTime;
    }
}

export function youtubeIdParser(url: string): string {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = regExp.exec(url);
    return (match && match[7].length === 11) ? match[7] : null;
}

export class YouTubeWrapper {
    private readonly player: any;

    constructor(private videoId: string, divId: string, onPlayerLoad: (event) => void, onStateChange: (event) => void) {
        this.player = new window.YT.Player(divId, {
            events: {
                onReady: (event) => {
                    event.target.mute();
                    onPlayerLoad(event);
                },
                onStateChange: (event) => {
                    const playerState = mapToPlayerState(event.data);

                    // Takes the video player out of a frozen state
                    if (playerState === PlayerState.unstarted) {
                        // This.player.playVideo();
                    } else {
                        onStateChange(playerState);
                    }
                },
            },
            height: 390,
            videoId: this.videoId,
            width: 640,
        });
    }

    /**
     * Returns current time in seconds?
     */
    public getCurrentTime(): number {
        return this.player.getCurrentTime();
    }

    public loadNewVideo(videoId: string) {
        if (this.videoId !== videoId) {
            this.videoId = videoId;
            this.player.loadVideoById(videoId);
        }
    }

    public isPlaying(): boolean {
        return (this.player.getPlayerState() === 1);
    }

    public seekTo(time: number) {
        this.player.seekTo(time);
    }

    public playVideo() {
        this.player.playVideo();
    }

    public pauseVideo() {
        this.player.pauseVideo();
    }

    public getDuration(): number {
        return this.player.getDuration();
    }
}

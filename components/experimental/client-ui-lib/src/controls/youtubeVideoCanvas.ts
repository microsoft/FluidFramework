/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedMap } from "@microsoft/fluid-map";
import ui from "../ui";
// eslint-disable-next-line import/no-internal-modules
import { getProposedPlaybackTime, PlayerState, YouTubeWrapper } from "../utils/youtubeHelper";

interface IVideoState {
    playing: boolean;
    elapsedTime: number;
    lastChangeUTC: number;
    src?: string;
}

/**
 * Youtube video app
 */
export class YouTubeVideoCanvas extends ui.Component {
    public player: YouTubeWrapper;
    private videoId: string;
    private readonly playerId = "player";

    constructor(elem: HTMLDivElement, private readonly videoMap: ISharedMap) {
        super(elem);

        // Youtube Setup
        this.videoId = "-Of_yz-4iXs"; // Default Minecraft video
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        window.onYouTubeIframeAPIReady = () => { this.loadYoutubePlayer(); };

        // Add youtube player to the DOM
        const playerDiv = document.createElement("div");
        playerDiv.id = this.playerId;
        elem.appendChild(playerDiv);

        // Build switch button
        const button = document.getElementById("switch");
        // TODO: fix this
        button.onclick = () => {
            const videoInput = document.getElementById("videoId") as HTMLInputElement;
            this.videoId = videoInput.value;
            this.player.loadNewVideo(this.videoId);
        };

        // Load in Youtube Script
        const tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        elem.appendChild(tag);
    }

    public async loadYoutubePlayer() {
        // Fetch a synchronous version of the youTubeVideo Map for easier use

        this.player = new YouTubeWrapper(this.videoId, this.playerId,
            // On YouTube Player Ready
            (event) => {
                if (this.videoMap.has("state")) {
                    const state = this.videoMap.get<IVideoState>("state");

                    const proposedPlaybackTime = getProposedPlaybackTime(state.lastChangeUTC,
                        state.playing, state.elapsedTime);

                    // Valid playback time
                    if (proposedPlaybackTime < this.player.getDuration()) {
                        this.player.seekTo(proposedPlaybackTime);
                        if (state.playing) {
                            this.player.playVideo();
                        } else {
                            this.player.pauseVideo();
                        }
                    } else {
                        // We've finished the video! Reset the state.
                        this.videoMap.set<IVideoState>("state", {
                            elapsedTime: 0,
                            lastChangeUTC: Date.now(),
                            playing: false,
                            src: this.videoId,
                        });
                    }
                }
            },
            // On YouTube Player play/pause/buffer State Change
            (playerState) => {
                // Update current time, play/pause, src, last changed time
                if (playerState === PlayerState.playing || playerState === PlayerState.paused) {
                    this.videoMap.set<IVideoState>("state", {
                        elapsedTime: this.player.getCurrentTime(),
                        lastChangeUTC: Date.now(),
                        playing: (playerState === PlayerState.playing),
                        src: this.videoId,
                    });
                }
            });

        // Actions to take when the client receives an update to the video map
        this.videoMap.on("valueChanged", (value) => {
            if (value.key === "state") {
                const incomingState = this.videoMap.get<IVideoState>(value.key);
                const incomingPlaybackTime = (Date.now() -
                    incomingState.lastChangeUTC +
                    incomingState.elapsedTime * 1000) / 1000;

                this.player.loadNewVideo(incomingState.src);

                // Is incomingState very similar to local state
                if (Math.abs(incomingState.lastChangeUTC - Date.now()) / 1000 < 2 &&
                    Math.abs(this.player.getCurrentTime() - incomingPlaybackTime) < 2 &&
                    incomingState.playing === this.player.isPlaying()
                ) {
                    console.log("Ignore local changes");
                } else {
                    if (!incomingState.playing) {
                        this.player.pauseVideo();
                    }
                    if (Math.abs(this.player.getCurrentTime() - incomingPlaybackTime) > .5) {
                        this.player.seekTo(incomingPlaybackTime);
                    }
                    if (incomingState.playing) {
                        this.player.playVideo();
                    }
                }
            } else {
                console.log(`Default: ${value.key}`);
            }
        });
    }
}

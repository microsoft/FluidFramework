import { api, types } from "../client-api";
import * as ui from "../ui";

// tslint:disable-next-line:no-namespace
declare global {
    // tslint:disable-next-line:interface-name
    interface Window {
        onYouTubeIframeAPIReady?: () => void;
        YT: any;
    }
}

interface IVideoState {
    playing: boolean;
    elapsedTime: number;
    lastChangeUTC: number;
    src?: string;
}

/**
 * youtube video app
 */
export class YouTubeVideoCanvas extends ui.Component {
    public player: any;
    private videoId: string;
    private videoMap: types.IMap;
    private videoMapView: types.IMapView;

    constructor(elem: HTMLDivElement, private doc: api.Document, private root: types.IMap) {
        super(elem);
        this.player = null;
        this.videoId = "-Of_yz-4iXs"; // Default Minecraft video

        window.onYouTubeIframeAPIReady = () => { this.loadYoutubePlayer(); };

        const playerDiv = document.createElement("div");
        playerDiv.id = "player";
        elem.appendChild(playerDiv);

        let button = document.getElementById("create");
        button.onclick = () => {
            let videoInput = document.getElementById("videoId") as HTMLInputElement;
            this.videoId = videoInput.value;
            this.player.loadVideoById(this.videoId);
        };

        let tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        elem.appendChild(tag);
    }

    public async loadYoutubePlayer() {

        if (await this.root.has("youTubeVideo")) {
            this.videoMap = await this.root.get<types.IMap>("youTubeVideo");
        } else {
            this.videoMap = await this.root.set<types.IMap>("youTubeVideo", this.doc.createMap());
        }

        this.videoMapView = await this.videoMap.getView();

        /**
         *  Set start variables
         */
        let playing: number = 0;
        let currentPlaybackTime: number = 0;

        // tslint:disable-next-line:no-unused-new
        this.player = new window.YT.Player("player", {
            events: {
                onReady: (event) => {
                    event.target.mute();

                    if (this.videoMapView.has("state")) {
                        let state = this.videoMapView.get<IVideoState>("state");
                        playing = state.playing ? 1 : 0;
                        currentPlaybackTime = (Date.now() - state.lastChangeUTC + state.elapsedTime * 1000) / 1000;

                        if (currentPlaybackTime < event.target.getDuration()) {
                            event.target.seekTo(currentPlaybackTime);
                            if (playing) {
                                event.target.playVideo();
                            } else {
                                event.target.pauseVideo();
                            }
                        } else {
                            this.videoMapView.set<IVideoState>("state", {
                                elapsedTime: 0,
                                lastChangeUTC: Date.now(),
                                playing,
                                src: this.videoId,
                            });
                        }
                    }
                },
                onStateChange: (event) => {
                    let playerState = event.data;

                    if (playerState === 1 || playerState === 2) {
                        this.videoMapView.set<IVideoState>("state", {
                            elapsedTime: event.target.getCurrentTime(),
                            lastChangeUTC: Date.now(),
                            playing: playerState === 1,
                            src: this.videoId,
                        });
                    } else if (playerState === -1 ) {
                        event.target.playVideo(); // Takes the player out of frozen state
                    } else {
                        console.log("Buffering: " + playerState);
                    }
                },
            },
            height: 390,
            playerVars: {
                autoplay: playing,
                start: currentPlaybackTime,
            },
            videoId: this.videoId,
            width: 640,
        });

        this.videoMap.on("valueChanged", (value) => {
            if (value.key === "state") {
                let incomingState = this.videoMapView.get<IVideoState>(value.key);
                let incomingPlaybackTime = (Date.now() -
                                        incomingState.lastChangeUTC +
                                        incomingState.elapsedTime * 1000) / 1000;
                if (this.videoId !== incomingState.src) {
                    this.videoId = incomingState.src;
                    this.player.loadVideoById(incomingState.src);
                }

                // is incomingState very similar to my own state?
                if (Math.abs(incomingState.lastChangeUTC - Date.now()) / 1000 < 2 &&
                    Math.abs(this.player.getCurrentTime() - incomingPlaybackTime) < 2 &&
                    incomingState.playing === (this.player.getPlayerState() === 1)
                ) {
                    console.log("Ignore local changes");
                } else {
                    if (!incomingState.playing) {
                        this.player.pauseVideo();
                    }
                    if ( Math.abs(this.player.getCurrentTime() - incomingPlaybackTime) > .5) {
                        this.player.seekTo(incomingPlaybackTime);
                    }
                    if (incomingState.playing) {
                        this.player.playVideo();
                    }
                }
            } else {
                console.log("Default: " + value.key);
            }
        });
    }

    public youtubeIdParser(url: string): string {
        let regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#\&\?]*).*/;
        let match = url.match(regExp);
        return (match && match[7].length === 11) ? match[7] : null;
    }
}

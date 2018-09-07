import * as api from "@prague/client-api";
import { IMap, IMapView } from "@prague/map";
import * as ui from "../ui";
import { getProposedPlaybackTime, PlayerState, YouTubeWrapper } from "../utils/youtubeHelper";

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
    public player: YouTubeWrapper;
    private videoId: string;
    private videoMap: IMap;
    private videoMapView: IMapView;
    private playerId = "player";

    constructor(elem: HTMLDivElement, private doc: api.Document, private root: IMap) {
        super(elem);

        // Youtube Setup
        this.videoId = "-Of_yz-4iXs"; // Default Minecraft video
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

        // Create our distributed Map, called "youTubeVideo", on the root map
        if (await this.root.has("youTubeVideo")) {
            this.videoMap = await this.root.get<IMap>("youTubeVideo");
        } else {
            this.videoMap = await this.root.set<IMap>("youTubeVideo", this.doc.createMap());
        }

        // Fetch a synchronous version of the youTubeVideo Map for easier use
        this.videoMapView = await this.videoMap.getView();

        this.player = new YouTubeWrapper(this.videoId, this.playerId,
        // On YouTube Player Ready
        (event) => {
            if (this.videoMapView.has("state")) {
                const state = this.videoMapView.get<IVideoState>("state");

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
                    this.videoMapView.set<IVideoState>("state", {
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
                this.videoMapView.set<IVideoState>("state", {
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
                const incomingState = this.videoMapView.get<IVideoState>(value.key);
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
}

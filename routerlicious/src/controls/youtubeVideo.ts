import { types } from "../client-api";
import * as ui from "../ui";

class VideoState {
    public playing: boolean;
    public elapsedTime: number;
    public lastChangeUTC: number;
    public vid?: string;

    constructor(playing: boolean, elapsedTime: number, lastChangeUTC: number, vid?: string ) {
        this.playing = playing;
        this.elapsedTime = elapsedTime;
        this.lastChangeUTC = lastChangeUTC;
        this.vid = vid;
    }
}

/**
 * Basic collaborative youtube video player
 */
export class YouTubeVideo extends ui.Component {
    private videoMap: types.IMap;
    private videoMapView: types.IMapView;

    constructor(element: HTMLDivElement, private videoPlayer: YT.Player,
                private videoRoot: Promise<types.IMap>) {
        super(element);

        this.setEventHandlers();
    }

    private async setEventHandlers() {
        this.videoMap = await this.videoRoot;
        this.videoMapView = await this.videoMap.getView();

        this.setVideoPlayerHandlers();

        this.setVideoMapHandlers();
    }

    private async setVideoPlayerHandlers() {
        this.videoPlayer.addEventListener("onReady", (state) => {
            this.handleState(JSON.parse(this.videoMapView.get("state")));
        });

        this.videoPlayer.addEventListener("onStateChange", (state) => {
            let stateChange = state as YT.OnStateChangeEvent;

            switch (stateChange.data) {
                case(YT.PlayerState.UNSTARTED):
                case(YT.PlayerState.CUED):
                case(YT.PlayerState.BUFFERING):
                    break;
                case(YT.PlayerState.PAUSED):
                    // Buffer Event
                    if (Math.abs(this.getState().elapsedTime
                        - this.getElapsedTime(JSON.parse(this.videoMapView.get("state")))) > 2) {
                            this.videoPlayer.playVideo();
                        } else {
                            this.updateState();
                        }
                    break;
                case(YT.PlayerState.PLAYING):
                    this.updateState();
                    break;
                default:
                    console.log(stateChange);
            }
        });
    }

    private async setVideoMapHandlers() {
        this.videoMap.on("valueChanged", (changedValue) => {
            switch (changedValue.key) {
                case ("state"):
                    this.handleState(JSON.parse(this.videoMapView.get(changedValue.key)));
                    break;
                default:
                    console.log("default: " + changedValue.key);
                    break;
            }
        });
    }

    private getState(): VideoState {
        let playing = (this.videoPlayer.getPlayerState() === YT.PlayerState.PLAYING);
        return new VideoState(playing, this.videoPlayer.getCurrentTime(), Date.now(), null);
    }

    private updateState() {
        this.videoMapView.set("state", JSON.stringify(this.getState()));
    }

    private handleState(incomingState: VideoState) {
        let localState = this.getState();
        if (!incomingState.playing) {

            this.videoPlayer.pauseVideo();
            this.videoPlayer.seekTo(incomingState.elapsedTime, true);
        } else {

            // elapsed time + the difference current and when "incoming" was recorded
            let elapsedTime = this.getElapsedTime(incomingState);
            if (Math.abs(elapsedTime - localState.elapsedTime) > 1 ) {
                this.videoPlayer.seekTo(elapsedTime, true);
            }

            this.videoPlayer.playVideo();
        }
    }

    private getElapsedTime(incomingState: VideoState): number {
        let elapsedTime = 0;
        if (Math.abs(incomingState.lastChangeUTC - Date.now()) < this.videoPlayer.getDuration() * 1000) {
            elapsedTime = incomingState.elapsedTime + Date.now() / 1000 - incomingState.lastChangeUTC / 1000;
        } else {
            elapsedTime = incomingState.elapsedTime;
        }
        return elapsedTime;
    }
}

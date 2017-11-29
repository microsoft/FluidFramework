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
        this.videoPlayer.addEventListener("onReady", (x) => {
            let incomingState = JSON.parse(this.videoMapView.get("state"));
            // This is a hack... play is getting auto triggered
            this.handleState(incomingState);
            setTimeout( () => this.pauseVideo(incomingState), 500);
        });

        this.videoPlayer.addEventListener("onStateChange", (state) => {
            let stateChange = state as YT.OnStateChangeEvent;
            let localState = this.getState();
            switch (stateChange.data) {
                case(YT.PlayerState.UNSTARTED): // -1
                    break;
                case(YT.PlayerState.CUED): // 5
                    break;
                case(YT.PlayerState.BUFFERING): // 3
                    break;
                case(YT.PlayerState.PAUSED): // 2
                    // Buffer Event
                    let incomingState = JSON.parse(this.videoMapView.get("state"));
                    if (Math.abs(localState.elapsedTime
                        - this.getElapsedTime(incomingState)) > 2 && incomingState.playing) {
                            this.videoPlayer.playVideo();
                        } else {
                            this.updateState();
                        }
                    break;
                case(YT.PlayerState.PLAYING): // 1
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

    private pauseVideo(incomingState: VideoState): void {
        if (!incomingState.playing) {
            this.videoPlayer.pauseVideo();
        }
    }

    private updateState() {
        this.videoMapView.set("state", JSON.stringify(this.getState()));
    }

    // Replicate the incoming state
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

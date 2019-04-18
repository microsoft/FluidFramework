import { DefaultButton, Fabric, TextField } from "office-ui-fabric-react";
import { Range } from "rc-slider";
import "rc-slider/assets/index.css";
import * as React from "react";
import YouTube from "react-youtube";
import { VideoDocument } from "../documents";

export interface IPickerProps { video: VideoDocument; }
export interface IPickerState {
    videoId: string;
    duration: number;
    start: number;
    end: number;
    time: number;
    player: any;
}

export class Picker extends React.Component<IPickerProps, IPickerState> {
    private timer;

    constructor(props) {
        super(props);

        this.state = {
            duration: -1,
            end: this.props.video.end,
            player: null,
            start: this.props.video.start,
            time: this.props.video.start,
            videoId: this.props.video.id,
        };
    }

    public componentDidMount() {
        this.props.video.on("videoChanged", (local) => {
            if (!local) {
                this.setState({ videoId: this.props.video.id });
            }
        });

        this.props.video.on("startChanged", (local) => {
            if (!local) {
                this.setState({ start: this.props.video.start });
                if (this.state.player) {
                    this.state.player.seekTo(this.props.video.start);
                }
            }
        });

        this.props.video.on("endChanged", (local) => {
            if (!local) {
                this.setState({ end: this.props.video.end });
            }
        });
    }

    public render() {
        const opts = {
            playerVars: {
                autoplay: 1,
                controls: 0,
            },
            width: "100%",
        } as any;

        return (
            <Fabric>
                <h1 className="ms-font-su">Video Picker</h1>

                <TextField label="YouTube video ID" value={this.state.videoId} onChanged={this.onVideoChange} />

                <YouTube
                    onStateChange={this.onStateChange}
                    onReady={this.onReady}
                    videoId={this.state.videoId}
                    opts={opts}/>

                <Range
                    disabled={ this.state.duration === -1 }
                    marks={ { [this.state.time]: "^" } }
                    max={this.state.duration}
                    onChange={this.onRangeChange}
                    value={[
                        this.state.start,
                        this.state.end === -1 ? this.state.duration : this.state.end ]} />

                <div className="playback-buttons">
                    <DefaultButton
                        text="Play" primary={true} onClick={this.play} disabled={this.state.duration === -1} />
                </div>
            </Fabric>
        );
    }

    public play = () => {
        this.state.player.seekTo(this.state.start);
        this.state.player.playVideo();
        this.setState({ time: this.state.start });
    }

    public onReady = (event) => {
        this.setState({
            player: event.target,
        });
        event.target.seekTo(this.state.start);
    }

    public onStateChange = (event) => {
        console.log(event.data);
        const duration = Math.ceil(event.target.getDuration());
        if (duration && duration !== this.state.duration) {
            console.log(`New duration ${duration}`);
            this.setState({ duration });
        }

        if (event.data === 1) {
            this.timer = setInterval(
                () => {
                    const time = this.state.player.getCurrentTime();
                    this.setState({ time });
                    if (this.state.end !== -1 && time >= this.state.end) {
                        this.state.player.pauseVideo();
                    }
                },
                1000);
        }

        if (event.data === 0) {
            if (this.timer) {
                clearInterval(this.timer);
                this.timer = undefined;
            }
        }
    }

    public onVideoChange = (videoId) => {
        this.props.video.id = videoId;
        this.props.video.start = 0;
        this.props.video.end = -1;
        this.setState({ videoId, start: this.props.video.start, end: this.props.video.end });
    }

    public onRangeChange = (value) => {
        if (value[0] !== this.state.start) {
            this.props.video.start = value[0];
            this.setState({ start: value[0], time: value[0] });
            this.state.player.seekTo(value[0]);
        }

        if ((this.state.end === -1 && value[1] !== this.state.duration) ||
            (this.state.end !== -1 && value[1] !== this.state.end)) {
            console.log(`End range change ${value[1]}`);
            this.props.video.end = value[1];
            this.setState({ end: value[1] });
        }
    }
}

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import * as ReactDOM from "react-dom";
import ReactPlayer from 'react-player';
import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import { ISharedDirectory } from "@microsoft/fluid-map";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";
import { Provider, themes, Header, Table } from '@fluentui/react-northstar';
import {
    DefaultButton as Button,
    initializeIcons,
    TextField
} from "office-ui-fabric-react";
import YoutubeClient from "./clients/YoutubeClient";
import { IPlaylistItem, PlaylistKey, PlayerStateKey, PlayerStates, PlayerProgressKey, PlaylistIndexKey, PlayerProgressProportionKey, AcceptableDelta } from "./interfaces/PlayerInterfaces";
import Slider from "./components/Slider";
import Playlist from "./components/Playlist";

export const MediaPlayerName = "media-player";

initializeIcons();

/**
 * A component to allow you to add and manipulate components
 */
export class MediaPlayer extends PrimedComponent
    implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    private static readonly initialUrl = "https://www.youtube.com/watch?v=RMzXmkrlFNg&t=2s";
    private static readonly factory = new PrimedComponentFactory(MediaPlayer, []);

    public static getFactory() {
        return MediaPlayer.factory;
    }

    protected async componentHasInitialized() {

    }

    public changeEditState(isEditable: boolean){
        this.root.set("isEditable", isEditable);
    }

    protected async componentInitializingFirstTime() {
        const newVideoId = this.getYoutubeVideoId(MediaPlayer.initialUrl);
        await YoutubeClient.getVideoById(newVideoId).then(response => {
            console.log(response);
            var firstPlaylistItem: IPlaylistItem = {
                name: response.snippet.title,
                url: MediaPlayer.initialUrl,
                id: newVideoId,
                thumbnailUrl: response.snippet.thumbnails.standard.url,
                channelName: response.snippet.channelTitle,
                description: response.snippet.description
            };
            this.root.set(PlaylistKey, [firstPlaylistItem]);
            this.root.set(PlaylistIndexKey, 0);
            this.root.set(PlayerStateKey, PlayerStates.Playing);
            this.root.set(PlayerProgressKey, -1);
        });
    }

    /**
     * Will return a new MediaPlayerView
     */
    public render(div: HTMLElement) {
        ReactDOM.render(
            <Provider theme={themes.teams}>
                <MediaPlayerView
                    root={this.root}
                />
            </Provider>
            ,
            div,
        );
    }

    private getYoutubeVideoId = (url: string) => {
        var regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        var match = url.match(regExp);
        if (match && match[2].length == 11) {
          return match[2];
        } else {
          return undefined;
        }
      }
}

interface IMediaPlayerViewProps {
    root: ISharedDirectory;
}

interface IMediaPlayerViewState {
    playedProportion: number;
    newUrl: string;
    playlist: IPlaylistItem[]
}

class MediaPlayerView extends React.Component<IMediaPlayerViewProps, IMediaPlayerViewState> {

    private reactPlayerRef: any = null; // ReactPlayer component
    private styles = {
        playlistItem: { border:".1vh solid green" } as React.CSSProperties,
        playerTableContainer: { backgroundColor:"transparent", height: "50vh", width: "100%", padding: "2vh" } as React.CSSProperties,
        playlistButton: { height: "4vh", width: "7%", margin: ".5vh", marginBottom: "1vh" } as React.CSSProperties,
        urlInput: { height:"4.2vh", width: "75%", margin: ".5vh", marginBottom: "1vh", float: "left" } as React.CSSProperties,
        playlistControlContainer: { width: "100%", alignItems: "center", marginTop: "2vh"} as React.CSSProperties,
        playlistButtonContainer: {float: "right"} as React.CSSProperties
    };
    private isSeeking = false;

    constructor(props: IMediaPlayerViewProps){
        super(props);
        const {root} = this.props;
        this.state = {
            playedProportion: root.get(PlayerProgressProportionKey),
            newUrl: "",
            playlist: root.get<IPlaylistItem[]>(PlaylistKey)
        }
        root.on("valueChanged", (change, local) => {
            if (root.get(PlayerProgressProportionKey) != this.state.playedProportion) {
                this.setState({
                    playedProportion: root.get(PlayerProgressProportionKey)
                });
            }
            if (root.get(PlaylistKey) != this.state.playlist) {
                this.setState({
                    playlist: root.get<IPlaylistItem[]>(PlaylistKey)
                });
            }
        });
    }

    render(){
        const { root } = this.props;
        const { playedProportion, newUrl, playlist } = this.state;
        const playlistIndex = root.get<number>(PlaylistIndexKey);
        if (playlistIndex < playlist.length && playlist[playlistIndex]) {
            const currentVideo = playlist[playlistIndex];
            const videoUrl = currentVideo.url;
            const videoChannelName = currentVideo.channelName;
            const videoName = currentVideo.name;
            const playerState = root.get(PlayerStateKey);
            return (
                <Table style={this.styles.playerTableContainer}>
                    <td>
                        <tr>
                            <ReactPlayer
                                url={videoUrl}
                                playing={playerState === PlayerStates.Playing || playerState === PlayerStates.Buffering || playerState === PlayerStates.Seeking}
                                onStart={() => root.set(PlayerStateKey, PlayerStates.Playing)}
                                onPlay={() => {
                                    console.log("Clicked play");
                                    root.set(PlayerStateKey, PlayerStates.Playing);
                                }}
                                onPause={() => root.set(PlayerStateKey, PlayerStates.Paused)}
                                onBuffer={() => root.set(PlayerStateKey, PlayerStates.Buffering)}
                                progressInterval={500}
                                onProgress={({played, playedSeconds}) => this.onProgress(played, playedSeconds)}
                                ref={(playerNode: any) => { this.reactPlayerRef = playerNode; }}
                                width={"82vh"}
                                controls={true}
                            />
                        </tr>
                        <tr>
                            <Slider value={playedProportion} root={root} reactPlayerRef={this.reactPlayerRef}></Slider>
                        </tr>
                        <tr>
                            <Header 
                                as={"h2"} 
                                content={videoName} 
                                description={{
                                    content: `By ${videoChannelName}`,
                                    as: 'span',
                                }}
                            />
                        </tr>
                        <tr>
                            <div style={this.styles.playlistControlContainer}>
                                <div style={this.styles.urlInput}>
                                    <TextField
                                        placeholder={"Please enter new playlist item URL here..."}
                                        value={newUrl}
                                        onChange={(event: React.ChangeEvent<HTMLInputElement>) => 
                                            this.setState({
                                                newUrl: event.target.value
                                            })
                                        }
                                    />
                                </div>
                                <div style={this.styles.playlistButtonContainer}>
                                    <Button 
                                        iconProps={{ iconName: "Add" }}
                                        style={this.styles.playlistButton}
                                        onClick={() => this.onAddClicked(newUrl)}
                                    />
                                    <Button
                                        iconProps={{ iconName: "Next" }}
                                        style={this.styles.playlistButton}
                                        onClick={() => this.onNextClicked()}
                                    />
                                </div>
                                
                            </div>
                        </tr>
                        <tr>
                            <Playlist playlist={playlist} currentIndex={playlistIndex} />
                        </tr>
                    </td>
                </Table>
            );
        }
    }

    private onProgress = (played: number, playedSeconds: number) => {
        const {root} = this.props;
        const currentLeaderSeconds = root.get(PlayerProgressKey);
        const playerState = root.get(PlayerStateKey);
        if (Math.abs(currentLeaderSeconds - playedSeconds) > AcceptableDelta && playedSeconds > 2
            || playerState === PlayerStates.Seeking) {
            this.seekPlayer(currentLeaderSeconds);
        } else if (root.get(PlayerStateKey) !== PlayerStates.Seeking && !this.isSeeking) {
            console.log(`PROGRESS ${played} ${playedSeconds}`)
            root.set(PlayerProgressKey, playedSeconds);
            root.set(PlayerProgressProportionKey, played);
        }
    }

    private seekPlayer = (seekSeconds: number) => {
        console.log(`SEEKING ${seekSeconds}`);
        if (this.reactPlayerRef) {
            this.reactPlayerRef.seekTo(seekSeconds);
        }
    }

    private onAddClicked = (newUrl: string) => {
        if (ReactPlayer.canPlay(newUrl)) {
            const { root } = this.props;
            const playlist = root.get<IPlaylistItem[]>(PlaylistKey);
            const newVideoId = YoutubeClient.getYoutubeVideoId(newUrl);
            YoutubeClient.getVideoById(newVideoId).then(response => {
              var newPlaylistItem: IPlaylistItem = {
                name: response.snippet.title,
                url: newUrl,
                id: newVideoId,
                thumbnailUrl: response.snippet.thumbnails.standard.url,
                channelName: response.snippet.channelTitle,
                description: response.snippet.description
              };
              playlist.push(newPlaylistItem);
              root.set<IPlaylistItem[]>(PlaylistKey, playlist);
              this.setState({newUrl: ""});
            })
        } else {
            alert("This URL is not currently supported! Please try again!");
        }
        
    }
    
    private onNextClicked = () => {
        const { root } = this.props;
        const nextIndex = root.get(PlaylistIndexKey) + 1;
        root.set(PlayerProgressKey, 0);
        root.set(PlayerProgressProportionKey, 0);
        root.set(PlaylistIndexKey, nextIndex);
    }


}

export const fluidExport = MediaPlayer.getFactory();
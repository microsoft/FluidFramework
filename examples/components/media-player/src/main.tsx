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
    TextField,
    Text
} from "office-ui-fabric-react";
import YoutubeClient from "./clients/YoutubeClient";
import { IPlaylistItem, PlaylistKey, PlayerStateKey, PlayerState, PlayerProgressKey, PlaylistIndexKey, PlayerProgressProportionKey, AcceptableDelta, MediaSource, InitialBuffer } from "./interfaces/PlayerInterfaces";
import Slider from "./components/Slider";
import Playlist from "./components/Playlist";
import SoundcloudClient from "./clients/SoundcloudClient";
import VimeoClient from "./clients/VimeoClient";

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

    public changeEditState(isEditable: boolean){
        this.root.set("isEditable", isEditable);
    }

    protected async componentInitializingFirstTime() {
        const newVideoId = YoutubeClient.getYoutubeVideoId(MediaPlayer.initialUrl);
        if (newVideoId) {
            await YoutubeClient.getVideoById(newVideoId).then(response => {
                console.log(response);
                var firstPlaylistItem: IPlaylistItem = {
                    name: response.snippet.title,
                    url: MediaPlayer.initialUrl,
                    id: newVideoId,
                    thumbnailUrl: response.snippet.thumbnails.standard.url,
                    channelName: response.snippet.channelTitle,
                    description: response.snippet.description,
                    mediaSource: MediaSource.Youtube
                };
                this.root.set(PlaylistKey, [firstPlaylistItem]);
                this.root.set(PlaylistIndexKey, 0);
                this.root.set(PlayerStateKey, PlayerState.Paused);
                this.root.set(PlayerProgressKey, 0);
            });
        }
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
}

interface IMediaPlayerViewProps {
    root: ISharedDirectory;
}

interface IMediaPlayerViewState {
    playedProportion: number;
    playedSeconds: number;
    leaderSeconds: number;
    newUrl: string;
    playlist: IPlaylistItem[],
    playerState: PlayerState
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
            playlist: root.get<IPlaylistItem[]>(PlaylistKey),
            playerState: root.get(PlayerStateKey),
            playedSeconds: 0,
            leaderSeconds: 0
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
            if (root.get(PlayerStateKey) != this.state.playerState) {
                this.setState({
                    playerState: root.get(PlayerStateKey)
                });
            }
        });
    }

    render(){
        const { root } = this.props;
        const { playedProportion, newUrl, playlist, playerState, playedSeconds, leaderSeconds } = this.state;
        const playlistIndex = root.get<number>(PlaylistIndexKey);
        if (playlistIndex < playlist.length && playlist[playlistIndex]) {
            const currentVideo = playlist[playlistIndex];
            const videoUrl = currentVideo.url;
            const videoChannelName = currentVideo.channelName;
            const videoName = currentVideo.name;

   
            
            console.log(`Player State: ${playerState}`);
            return (
                <Table style={this.styles.playerTableContainer}>
                    <td>
                        <tr>
                            <ReactPlayer
                                url={videoUrl}
                                playing={playerState === PlayerState.Playing || playerState === PlayerState.Buffering || playerState === PlayerState.Seeking}
                                onStart={() => root.set(PlayerStateKey, PlayerState.Playing)}
                                onBuffer={() => root.set(PlayerStateKey, PlayerState.Buffering)}
                                onPlay={() => {
                                    console.log("Clicked play");
                                    root.set(PlayerStateKey, PlayerState.Playing);
                                }}
                                onPause={() => root.set(PlayerStateKey, PlayerState.Paused)}
                                progressInterval={500}
                                onProgress={({played, playedSeconds}) => this.onProgress(played, playedSeconds)}
                                ref={(playerNode: any) => { this.reactPlayerRef = playerNode; }}
                                width={"82vh"}
                                controls={true}
                            />
                        </tr>
                        <tr>
                            <div style={{marginTop: "2vh", textAlign: "center", background: "transparent"}}>
                                <Text style={{color: "green"}}>{this.toTimeStamp(playedSeconds)}</Text>
                                <Text>{" / "}</Text>
                                <Text style={{color: "red"}}>{this.toTimeStamp(leaderSeconds)}</Text>
                            </div>
                            
                            <Slider value={playedProportion} root={root} reactPlayerRef={this.reactPlayerRef}></Slider>
                        </tr>
                        <tr>
                            <Header 
                                as={"h2"} 
                                content={videoName} 
                                description={{
                                    content: currentVideo.mediaSource === MediaSource.Soundcloud 
                                        ? "From Soundcloud" : `By ${videoChannelName}`,
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
                                        onChange={(event: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>, newValue: string | undefined) => {
                                            if (newValue) {
                                                this.setState({
                                                    newUrl: newValue
                                                })
                                            }  
                                        }}
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
        this.setState({
            leaderSeconds: currentLeaderSeconds,
            playedSeconds: playedSeconds,
        })
        if (Math.abs(currentLeaderSeconds - playedSeconds) > AcceptableDelta || playerState === PlayerState.Seeking) {
            this.seekPlayer(currentLeaderSeconds);
        } else if (root.get(PlayerStateKey) !== PlayerState.Seeking && !this.isSeeking && playedSeconds > InitialBuffer) {
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

    private toTimeStamp = (seconds: number) => {
        var date = new Date(0);
        date.setSeconds(seconds);
        var timeString = date.toISOString().substr(11, 8);
        return timeString;
    }

    private onAddClicked = (newUrl: string) => {
        if (ReactPlayer.canPlay(newUrl)) {
            const { root } = this.props;
            const playlist = root.get<IPlaylistItem[]>(PlaylistKey);
            if (newUrl.indexOf("youtube.com") > 0) {
                const newVideoId = YoutubeClient.getYoutubeVideoId(newUrl);
                if (newVideoId) {
                    YoutubeClient.getVideoById(newVideoId).then(response => {
                        var newPlaylistItem: IPlaylistItem = {
                          name: response.snippet.title,
                          url: newUrl,
                          id: newVideoId,
                          thumbnailUrl: response.snippet.thumbnails.standard.url,
                          channelName: response.snippet.channelTitle,
                          description: response.snippet.description,
                          mediaSource: MediaSource.Youtube
                        };
                        playlist.push(newPlaylistItem);
                        root.set<IPlaylistItem[]>(PlaylistKey, playlist);
                        this.setState({newUrl: ""});
                      });
                } else {
                    alert("No track id found in the URL!");
                }
            } else if (newUrl.indexOf("soundcloud.com") > 0) {
                const newTrackId = SoundcloudClient.getSouncloudTrackId(newUrl);
                if (newTrackId) {
                    var newPlaylistItem: IPlaylistItem = {
                        name: newUrl,
                        url: newUrl,
                        id: newTrackId,
                        thumbnailUrl: "https://icons.iconarchive.com/icons/uiconstock/socialmedia/512/Soundcloud-icon.png",
                        channelName: "",
                        description: "",
                        mediaSource: MediaSource.Soundcloud
                    };
                    playlist.push(newPlaylistItem);
                    root.set<IPlaylistItem[]>(PlaylistKey, playlist);
                    this.setState({newUrl: ""});
                } else {
                    alert("No track id found in the URL!");
                }
            } else if (newUrl.indexOf("vimeo.com") > 0) {
                const newVideoId = VimeoClient.getVimeoTrackId(newUrl);
                if (newVideoId) {
                    VimeoClient.getVideoById(newVideoId).then(response => {
                        const pictureUrl = response.pictures.sizes[response.pictures.sizes.length - 1].link
                        var newPlaylistItem: IPlaylistItem = {
                            name: response.name,
                            url: response.link,
                            id: response.id,
                            thumbnailUrl: pictureUrl,
                            channelName: response.user.name,
                            description: response.description,
                            mediaSource: MediaSource.Vimeo
                        };
                        playlist.push(newPlaylistItem);
                        root.set<IPlaylistItem[]>(PlaylistKey, playlist);
                        this.setState({newUrl: ""});
                    });
                } else {
                    alert("No video id found in the URL!");
                }
                
            }
            
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
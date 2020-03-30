/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import * as ReactDOM from "react-dom";
import ReactPlayer from 'react-player';
import Collapsible from 'react-collapsible';
import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import { ISharedDirectory } from "@microsoft/fluid-map";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";
import YoutubeClient from "./clients/YoutubeClient";
import { IPlaylistItem, PlaylistKey, PlayerStateKey, PlayerStates, PlayerProgressKey, PlaylistIndexKey, PlayerProgressProportionKey, AcceptableDelta } from "./interfaces/PlayerInterfaces";
import Slider from "./components/Slider";

export const MediaPlayerName = "media-player";


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
            <MediaPlayerView
                root={this.root}
            />,
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
}

class MediaPlayerView extends React.Component<IMediaPlayerViewProps, IMediaPlayerViewState> {

    private reactPlayerRef: any = null; // ReactPlayer component
    private styles = {
        playlistItem: {border:"1px solid green"} as React.CSSProperties,
        playerContainer: {border:"1px solid black"} as React.CSSProperties
    };
    private isSeeking = false;

    constructor(props: IMediaPlayerViewProps){
        super(props);
        const {root} = this.props;
        this.state = {
            playedProportion: root.get(PlayerProgressProportionKey)
        }
        root.on("valueChanged", (change, local) => {
            if (root.get(PlayerProgressProportionKey) != this.state.playedProportion) {
                this.setState({
                    playedProportion: root.get(PlayerProgressProportionKey)
                });
            }
        });
    }

    render(){
        const { root } = this.props;
        const { playedProportion } = this.state;
        const playlist = root.get<IPlaylistItem[]>(PlaylistKey);
        const playlistIndex = root.get<number>(PlaylistIndexKey);
        if (playlistIndex < playlist.length && playlist[playlistIndex]) {
            const videoUrl = playlist[playlistIndex].url;
            const playerState = root.get(PlayerStateKey);
            const playlistComponent = this.renderPlaylistComponent(playlist, playlistIndex);
            return (
                <div style={this.styles.playerContainer}>
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
                        progressInterval={100}
                        onProgress={({played, playedSeconds}) => this.onProgress(played, playedSeconds)}
                        ref={(playerNode: any) => { this.reactPlayerRef = playerNode; }}
                    />
                    <Slider value={playedProportion} root={root} reactPlayerRef={this.reactPlayerRef}></Slider>
                    {playlistComponent}
                </div>
            );
        }
        
    }

    private renderPlaylistComponent = (playlist: IPlaylistItem[], currentIndex: number) => {
        const historyPlaylist = playlist.slice(0, currentIndex);
        const futurePlaylist = playlist.slice(currentIndex + 1);
        const historyPlaylistComponent = this.renderList(historyPlaylist);
        const futurePlaylistComponent = this.renderList(futurePlaylist);
        return (
          <div>
            <Collapsible style={this.styles.playlistItem} trigger={"Queue"}>{futurePlaylistComponent}</Collapsible>
            <Collapsible style={this.styles.playlistItem} trigger={"History"}>{historyPlaylistComponent}</Collapsible>
          </div>
        );
    }

    private renderList = (playlist: IPlaylistItem[]) => {
        return (
          <ul>
            {playlist.map(item => (
              this.renderItem(item)
            ))}
          </ul>
        );
    }

    
  private renderItem = (item: IPlaylistItem) => {
    return(
      <div>
        <img src={item.thumbnailUrl}/>
        <br/>
        <label>{item.name}</label>
        <br/>
        <label>{item.channelName}</label>
        <br/>
        <label>{item.description}</label>
      </div>
    )
  }

  private onProgress = (played: number, playedSeconds: number) => {
    const {root} = this.props;
    const currentLeaderSeconds = root.get(PlayerProgressKey);
    const playerState = root.get(PlayerStateKey);
    if (currentLeaderSeconds - playedSeconds > AcceptableDelta || playerState === PlayerStates.Seeking) {
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
  
}

export const fluidExport = MediaPlayer.getFactory();
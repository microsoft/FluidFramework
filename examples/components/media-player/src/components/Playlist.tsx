/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import Collapsible from 'react-collapsible';
import {
    DefaultButton as Button,
    initializeIcons,
} from "office-ui-fabric-react";
import { PlaylistItem } from "../interfaces/PlaylistInterfaces";
import { MediaSource } from "../interfaces/PlayerInterfaces";

interface PlaylistProps {
  currentIndex: number;
  playlist: PlaylistItem[];
}

interface PlaylistState {
  isHistoryOpen: boolean;
  isQueueOpen: boolean;
}

initializeIcons();

class Playlist extends React.Component<PlaylistProps, PlaylistState> {
  constructor(props: any) {
      super(props);
      this.state = {
        isQueueOpen: false,
        isHistoryOpen: false
      };
  }

  public render() {
    const { currentIndex, playlist } = this.props;
    const historyPlaylist = playlist.slice(0, currentIndex);
    const futurePlaylist = playlist.slice(currentIndex + 1);
    const historyPlaylistComponent = this._renderList(historyPlaylist);
    const futurePlaylistComponent = this._renderList(futurePlaylist);
    const queueButton = (
        <Button
            iconProps={{ iconName: this.state.isQueueOpen ? "ChevronUpEnd6" : "ChevronDownEnd6" }}
            style={{width: "100%", height: "40px"}}
            onClick={this._onClickQueue}
        >
            {"Queue"}
        </Button>
    );
    const historyButton = (
        <Button
            iconProps={{ iconName: this.state.isHistoryOpen ? "ChevronUpEnd6" : "ChevronDownEnd6" }}
            style={{width: "100%", height: "40px", marginTop: "10px"}}
            onClick={this._onClickHistory}
        >
            {"History"}
        </Button>
    );

    return (
      <div>
        <Collapsible open={this.state.isQueueOpen} trigger={queueButton}>{futurePlaylistComponent}</Collapsible>
        <Collapsible open={this.state.isHistoryOpen} trigger={historyButton}>{historyPlaylistComponent}</Collapsible>
      </div>
    );
  }
  
  private _renderList = (playlist: PlaylistItem[]) => {
    return playlist.length > 0? (
      <ul style={{maxHeight: "356px", border: "1px solid grey", overflow: "auto", paddingInlineStart: "0px", overflowY: "scroll"}}>
        {playlist.map(item => (
          this._renderItem(item)
        ))}
      </ul>
    ) : <h6 style={{marginBlockStart: "5px", marginBlockEnd: "0px", color: "grey"}}>Playlist is empty.</h6>;
  }

  private _renderItem = (item: PlaylistItem) => {
    let sourceName: JSX.Element | undefined;
    switch (item.mediaSource) {
      case MediaSource.Soundcloud:
          sourceName = <h3 style={{marginBlockStart: "0px", marginBlockEnd: "0px", color: "orange"}}>{"Soundcloud"}</h3>;
          break;
      case MediaSource.Twitch:
          sourceName = <h3 style={{marginBlockStart: "0px", marginBlockEnd: "0px", color: "purple"}}>{"Twitch"}</h3>;
          break;
      case MediaSource.Youtube:
        sourceName = <h3 style={{marginBlockStart: "0px", marginBlockEnd: "0px", color: "red"}}>{"YouTube"}</h3>;
        break;
      case MediaSource.Vimeo:
        sourceName = <h3 style={{marginBlockStart: "0px", marginBlockEnd: "0px", color: "light-blue"}}>{"Vimeo"}</h3>;
        break;
      default:
        sourceName = <h3 style={{marginBlockStart: "0px", marginBlockEnd: "0px", color: "black"}}>{"Unkown"}</h3>;
  }
    return(
        <div style={{margin: "1vh", height: "15vh"}}>
            <div style={{float: "left", minWidth: "15vh", alignItems: "center"}}>
                <img style={{width: "15vh", height: "auto", maxHeight: "15vh", marginLeft: "2vh", marginRight: "2vh"}} src={item.thumbnailUrl}/>
            </div>
            <div>
                {sourceName}
                <h3 style={{marginBlockStart: "0px", marginBlockEnd: "0px"}}>{item.name}</h3>
                <h4 style={{marginBlockStart: "0px", marginBlockEnd: "0px", color: "grey"}}>{item.channelName}</h4>
            </div>
        </div>
                
    )
  }

  private _onClickQueue = () => {
    const isQueueOpen = this.state.isQueueOpen;
    this.setState({
      isQueueOpen: !isQueueOpen,
      isHistoryOpen: false
    });
  }

  private _onClickHistory = () => {
    const isHistoryOpen = this.state.isHistoryOpen;
    this.setState({
      isHistoryOpen: !isHistoryOpen,
      isQueueOpen: false
    });
  }
}


export default Playlist;
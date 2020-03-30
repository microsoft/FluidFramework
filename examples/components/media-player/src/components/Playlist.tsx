/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import Collapsible from 'react-collapsible';
import { PlaylistItem } from "../interfaces/PlaylistInterfaces";

interface PlaylistProps {
  currentIndex: number;
  playlist: PlaylistItem[];
}

interface PlaylistState {
  isHistoryOpen: boolean;
  isQueueOpen: boolean;
}

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
    const queueButton = <button style={{width: "100%", height: "40px"}} onClick={this._onClickQueue}>{this._getQueueTriggerLabel()}</button>;
    const historyButton = <button style={{width: "100%", height: "40px", marginTop: "10px"}} onClick={this._onClickHistory}>{this._getHistoryTriggerLabel()}</button>;

    return (
      <div>
        <Collapsible open={this.state.isQueueOpen} trigger={queueButton}>{futurePlaylistComponent}</Collapsible>
        <Collapsible open={this.state.isHistoryOpen} trigger={historyButton}>{historyPlaylistComponent}</Collapsible>
      </div>
    );
  }

  private _getQueueTriggerLabel = (): string => {
    return this.state.isQueueOpen ?  "Queue ⬆" : "Queue ⬇";
  }

  private _getHistoryTriggerLabel = (): string => {
    return this.state.isHistoryOpen ? "History ⬆" : "History ⬇" ;
  }
  
  private _renderList = (playlist: PlaylistItem[]) => {
    return playlist.length > 0? (
      <ul style={{maxHeight: "356px", border: "1px solid grey", overflow: "auto", paddingInlineStart: "0px"}}>
        {playlist.map(item => (
          this._renderItem(item)
        ))}
      </ul>
    ) : <h6 style={{marginBlockStart: "5px", marginBlockEnd: "0px", color: "grey"}}>Playlist is empty.</h6>;
  }

  private _renderItem = (item: PlaylistItem) => {
    return(
      <div style={{borderBottom: "1px solid grey"}}>
        <img style={{maxWidth: "120px", marginTop: "5px", marginLeft: "60px"}} src={item.thumbnailUrl}/>
        <h5 style={{marginBlockStart: "0px", marginBlockEnd: "0px"}}>{item.name}</h5>
        <h6 style={{marginBlockStart: "0px", marginBlockEnd: "0px", color: "grey"}}>{item.channelName}</h6>
      </div>
    )
  }

  private _onClickQueue = (e: React.MouseEvent) => {
    const isQueueOpen = this.state.isQueueOpen;
    this.setState({
      isQueueOpen: !isQueueOpen,
      isHistoryOpen: false
    });
  }

  private _onClickHistory = (e: React.MouseEvent) => {
    const isHistoryOpen = this.state.isHistoryOpen;
    this.setState({
      isHistoryOpen: !isHistoryOpen,
      isQueueOpen: false
    });
  }
}


export default Playlist;
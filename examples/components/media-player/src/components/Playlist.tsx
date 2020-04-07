/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/consistent-type-assertions */
/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import Collapsible from "react-collapsible";
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

const styles = {
    queueButton: {width: "100%", height: "40px"} as React.CSSProperties,
    historyButton: {width: "100%", height: "40px", marginTop: "10px"} as React.CSSProperties,
    listContainer: {maxHeight: "356px", border: "1px solid grey", overflow: "auto", paddingInlineStart: "0px", overflowY: "scroll"} as React.CSSProperties,
    emptyListContainer: {marginBlockStart: "5px", marginBlockEnd: "0px", color: "grey"} as React.CSSProperties,
    sourceLabel: {marginBlockStart: "0px", marginBlockEnd: "0px"} as React.CSSProperties,
    itemContainer: {margin: "1vh", height: "15vh"} as React.CSSProperties,
    itemImageContainer: {float: "left", minWidth: "15vh", alignItems: "center"} as React.CSSProperties,
    itemImage: {width: "15vh", height: "auto", maxHeight: "15vh", marginLeft: "2vh", marginRight: "2vh"} as React.CSSProperties,
    itemTitleLabel: {marginBlockStart: "0px", marginBlockEnd: "0px"} as React.CSSProperties,
    itemChannelLabel: {marginBlockStart: "0px", marginBlockEnd: "0px", color: "grey"} as React.CSSProperties,
};

class Playlist extends React.Component<PlaylistProps, PlaylistState> {
    constructor(props: any) {
        super(props);
        this.state = {
            isQueueOpen: false,
            isHistoryOpen: false,
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
                style={styles.queueButton}
                onClick={this._onClickQueue}
            >
                {"Queue"}
            </Button>
        );
        const historyButton = (
            <Button
                iconProps={{ iconName: this.state.isHistoryOpen ? "ChevronUpEnd6" : "ChevronDownEnd6" }}
                style={styles.historyButton}
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

    private readonly _renderList = (playlist: PlaylistItem[]) => {
        return playlist.length > 0? (
            <ul style={styles.listContainer}>
                {playlist.map((item) => (
                    this._renderItem(item)
                ))}
            </ul>
        ) : <h6 style={styles.emptyListContainer}>Playlist is empty.</h6>;
    };

    private readonly _renderItem = (item: PlaylistItem) => {
        let sourceName: JSX.Element | undefined;
        switch (item.mediaSource) {
            case MediaSource.Soundcloud:
                sourceName = <h3 style={{...styles.sourceLabel, color: "orange"}}>{"Soundcloud"}</h3>;
                break;
            case MediaSource.Twitch:
                sourceName = <h3 style={{...styles.sourceLabel, color: "purple"}}>{"Twitch"}</h3>;
                break;
            case MediaSource.Youtube:
                sourceName = <h3 style={{...styles.sourceLabel, color: "red"}}>{"YouTube"}</h3>;
                break;
            case MediaSource.Vimeo:
                sourceName = <h3 style={{...styles.sourceLabel, color: "lightblue"}}>{"Vimeo"}</h3>;
                break;
            default:
                sourceName = <h3 style={{...styles.sourceLabel, color: "black"}}>{"Unkown"}</h3>;
        }
        return(
            <div style={styles.itemContainer}>
                <div style={styles.itemImageContainer}>
                    <img style={styles.itemImage} src={item.thumbnailUrl}/>
                </div>
                <div>
                    {sourceName}
                    <h3 style={styles.itemTitleLabel}>{item.name}</h3>
                    <h4 style={styles.itemChannelLabel}>{item.channelName}</h4>
                </div>
            </div>

        );
    };

    private readonly _onClickQueue = () => {
        const isQueueOpen = this.state.isQueueOpen;
        this.setState({
            isQueueOpen: !isQueueOpen,
            isHistoryOpen: false,
        });
    };

    private readonly _onClickHistory = () => {
        const isHistoryOpen = this.state.isHistoryOpen;
        this.setState({
            isHistoryOpen: !isHistoryOpen,
            isQueueOpen: false,
        });
    };
}


// eslint-disable-next-line import/no-default-export
export default Playlist;

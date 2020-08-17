/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedClient } from "@fluidframework/protocol-definitions";
import React from "react";

// eslint-disable-next-line import/no-internal-modules, import/no-unassigned-import
import "./css/MemberList.css";

interface IProps {
    /**
   * Any Distributed Data Structure that users will interact with. A user is not shown in the
   * member list until the have touched this DDS.
   */
    members: IterableIterator<[string, ISequencedClient]>;
    /**
   * Callback for when an a new author is added
   */
    onNewAuthor: (func: (op, isLocal) => void) => void;
    style?: React.CSSProperties;
}

interface MemberInfo {
    color: string;
    name: string;
    initials: string;
    id: string;
}

interface IState {
    members: MemberInfo[];
}

export { IProps as IMemberListProps };

/**
 * Get a semi-random, but deterministic, color for a given client
 */
export const getColorForMember = (sc: ISequencedClient) => {
    // Support 20 unique colors
    const colorNumber = sc.sequenceNumber % 20;
    // Spread them through the hue range with an overflow so the first few authors are likely
    // to have very different colors
    return `hsl(${(colorNumber * 360 / 7) % 360}, 100%, 35%)`;
};

/**
 * A generic component which shows a list of authors as colored circles with initials.
 * @see getColorForMember to use the same color in other UI for each author
 */
export class MemberList extends React.Component<IProps, IState> {
    private readonly knownHumanMemberIds = new Set<string>();

    public constructor(props: IProps) {
        super(props);
        this.state = {
            members: [],
        };
    }

    // eslint-disable-next-line react/no-deprecated
    public componentWillMount() {
        this.updateMemberList();
        this.props.onNewAuthor((op, isLocal) => {
            if (!isLocal && !this.knownHumanMemberIds.has(op.clientId)) {
                this.knownHumanMemberIds.add(op.clientId);
                this.updateMemberList();
            }
        });
    }

    private readonly updateMemberList = () => {
        const members = Array.from(
            this.props.members,
        )
            .filter(([id, _]) => this.knownHumanMemberIds.has(id))
            .map(([id, sc]) => {
                let name: string = (sc.client.user as any).displayName || (sc.client.user as any).name;
                let initials: string;
                if (name) {
                    const nameWords = name.replace("_", " ").split(" ");
                    initials = nameWords[0][0].toUpperCase();
                    if (nameWords.length > 1) {
                        initials += nameWords[nameWords.length - 1][0].toUpperCase();
                    }
                } else {
                    name = sc.client.user.id.substring(0, 5);
                    initials = name.substring(0, 2);
                }

                return {
                    name,
                    initials,
                    color: getColorForMember(sc),
                    id,
                };
            });
        this.setState({ members });
    };

    public render() {
        return (
            <div className="memberList" style={this.props.style}>
                {this.state.members.map((memberInfo) => (
                    <div
                        className="memberIcon"
                        key={memberInfo.id}
                        style={{ backgroundColor: memberInfo.color }}
                        title={memberInfo.name}
                    >
                        {memberInfo.initials}
                    </div>
                ))}
            </div>
        );
    }
}

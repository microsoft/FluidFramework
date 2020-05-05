/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Chat, Divider, Input, Layout } from "@fluentui/react-northstar";
import * as React from "react";

interface IChatRendererProps {
    messagesToRender: any[];
    inputMessage: string;
    onChangeHandler: any;
    appendMessageCb: any;
}

export class ChatRenderer extends React.Component<IChatRendererProps> {
    public render() {
        const { messagesToRender, inputMessage, appendMessageCb, onChangeHandler } = this.props;
        return (
            <div>
                <Chat items={messagesToRender} />
                <Divider color="primary" size={2} important />
                <Layout
                    main={
                        <Input
                            fluid
                            icon="send"
                            value={inputMessage}
                            onChange={onChangeHandler}
                            placeholder="Message..."
                            onKeyPress={(event) => {
                                if (event.charCode === 13) {
                                    appendMessageCb();
                                }
                            }}
                        />
                    }
                />
            </div>
        );
    }
}

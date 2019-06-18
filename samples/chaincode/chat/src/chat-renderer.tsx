/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { Chat, Divider,Input, Layout} from "@stardust-ui/react";

interface ChatRendererProps {
  messagesToRender: any[];
  inputMessage: string;
  onChangeHandler: any;
  appendMessageCb: any;
}

export class ChatRenderer extends React.Component<ChatRendererProps> {
  componentDidUpdate() {
    window.scrollTo(0, document.body.scrollHeight);
  }

  render() {
    const { messagesToRender, inputMessage, appendMessageCb, onChangeHandler } = this.props;

    // TODO: turn Input into it's own component
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
              onKeyPress={(key, e) => {
                if (key.charCode === 13) {
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

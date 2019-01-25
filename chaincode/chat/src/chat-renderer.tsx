import * as React from "react";
import { Chat, Divider, Input } from "@stardust-ui/react";

interface ChatRendererProps {
  messagesToRender: any[];
  inputMessage: string;
  onChangeHandler: any;
  addMessageHandler: any;
}

export class ChatRenderer extends React.Component<ChatRendererProps> {
  render() {
    const { messagesToRender, inputMessage, addMessageHandler, onChangeHandler } = this.props;

    return (
      <div>
        <Chat items={messagesToRender} />
        <Divider color="primary" size={2} important />
        <Input
          fluid
          icon="send"
          value={inputMessage}
          onChange={onChangeHandler}
          placeholder="Message..."
          onKeyPress={(key, e) => {
            if (key.charCode === 13) {
              addMessageHandler();
            }
          }}
        />
      </div>
    );
  }
}

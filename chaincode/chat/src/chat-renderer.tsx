import * as React from "react";
import { Chat, Divider, Icon, Input, Layout, Popup, popupFocusTrapBehavior } from "@stardust-ui/react";

interface ChatRendererProps {
  messagesToRender: any[];
  inputMessage: string;
  onChangeHandler: any;
  addMessageHandler: any;
}

export class ChatRenderer extends React.Component<ChatRendererProps> {

  componentDidUpdate() {
    window.scrollTo(0,document.body.scrollHeight);
  }

  render() {
    const { messagesToRender, inputMessage, addMessageHandler, onChangeHandler } = this.props;

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
                  addMessageHandler();
                }
              }}
            />
          }
          end={
            <Popup
            accessibility={popupFocusTrapBehavior}
            trigger={
              <Icon name="add" size="large"/>
            }
            content={{
              content: (
                <>
                  <Input icon="add" fluid placeholder="Insert (Doc Id)" 
                    onKeyPress={(key) => {
                        if (key.charCode === 13) {
                          addMessageHandler( key.target.value )
                          key.target.value = "";
                        }
                      }}
                    />
                </>
              )
            }}
            >
            </Popup>
          }
          />
      </div>
    );
  }
}

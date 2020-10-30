import { ConsensusQueue } from '@fluidframework/ordered-collection';
import { SyncMessage } from '../SyncBridgeTypes';
import { SyncBridgeChannel } from './SyncBridgeChannel';
export class CommandProcessor {
  private commands: ConsensusQueue<SyncMessage>;
  private channel: SyncBridgeChannel;
  private executing: boolean = false;

  constructor(channel: SyncBridgeChannel, commands: ConsensusQueue<SyncMessage>) {
    this.channel = channel;
    this.commands = commands;
  }

  public initialize() {
    this.commands.on('add', this.onNewCommand);
  }

  private onNewCommand = async () => {
    if (this.executing) {
      return;
    }

    this.executing = true;
    console.log('CommandProcessor onNewCommand');
    await this.processNextCommand();
    this.executing = false;
  };

  private async processNextCommand() {
    const result = await this.channel.processNextCommand();
    if (result) {
      //await this.processNextCommand();
    }
  }
}

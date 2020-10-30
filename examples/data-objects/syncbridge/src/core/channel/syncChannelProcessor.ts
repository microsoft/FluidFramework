import { SyncBridgeOpCodes, SyncMessage, SyncMessageType } from '../../SyncBridgeTypes';
import {
  AcquireCallbackResult,
  AcquireResultType,
  ISyncChannelFrameworkHandle,
  SyncChannelEvent
} from './internalContracts';

// TODO: Revisit.
/**
 * SyncChannelProcessor is bound to a specific channel. That is there is
 * a processor per Channel.
 *
 * In future this could be bettered by say:
 * -----------------------------------------
 * Making processor stateless and re-using it for multiple channel.
 * This could be critical for performance if processor needs polling
 * for checking new updates. Which looks like a probable case at this
 * point and high level.
 */
export class SyncChannelProcessor {
  public constructor(readonly channelHandle: ISyncChannelFrameworkHandle) {}

  public registerListeners = (): void => {
    this.channelHandle.channelChangeListener(this.handleChannelChangeEvent);
    this.channelHandle.registerAcquireCallback(this.processAcquiredMessage);
  };

  protected processAcquiredMessage = async (message: SyncMessage): Promise<AcquireCallbackResult> => {
    console.log(
      `${this.channelHandle.getSyncDirection()} Processor acquired message: opCode => ${message.opCode}, type => ${
        message.type
      }, payload => ${message.payload}`
    );
    const result = await this.channelHandle.getMessageHandler()?.handleSyncMessage(message);
    // In case of success, remove from primary queue
    if (!result || !result.success) {
      // Failed to execute command, move to sideline queue
      console.log(
        `SyncDirection: ${this.channelHandle.getSyncDirection()} processor: Failed to handle message, moving to sideline queue.`
      );

      // Create SB Control message to notify on failure.
      const errorMessage: SyncMessage = {
        type: SyncMessageType.ControlMessage,
        opCode: SyncBridgeOpCodes.PROCESSING_ERROR,
        payload: {
          data: message, // Not mutating the message.
          error: result?.error
        }
      };
      await this.channelHandle.onError(errorMessage);
    } else {
      console.log('Message processed successfully!');
    }

    return { resultCode: AcquireResultType.Complete };
  };

  // TODO: Enrich event info.
  protected handleChannelChangeEvent = async (channelEvent: SyncChannelEvent): Promise<void> => {
    console.log(
      `SyncDirection: ${this.channelHandle.getSyncDirection()} Processor received event : opType => ${
        channelEvent.opType
      }, direction => ${channelEvent.direction}`
    );
    // TODO: Better handling later. Also, think about `scheduling`.
    const willAcquire = await this.channelHandle.acquire();
    console.log(`SyncDirection: ${this.channelHandle.getSyncDirection()} Processor will acquire: ${willAcquire}`);
  };
}

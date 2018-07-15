import { IOrderer, IOrdererManager } from "../../core";
import { KafkaOrdererFactory } from "./kafkaOrderer";
import { LocalOrderManager } from "./localOrderManager";

export class OrdererManager implements IOrdererManager {
    constructor(private localOrderManager: LocalOrderManager, private kafkaFactory: KafkaOrdererFactory) {
    }

    public async getOrderer(tenantId: string, documentId: string): Promise<IOrderer> {
        if (tenantId === "local") {
            return this.localOrderManager.get(tenantId, documentId);
        } else {
            return this.kafkaFactory.create(tenantId, documentId);
        }
    }
}

// /**
//  * Bridge from a socket.io socket to our internal IOrdererSocket
//  */
// class SocketIOOrdererSocket implements core.IOrdererSocket {
//     constructor(private socket: any) {
//     }

//     public send(topic: string, op: string, id: string, data: any[]) {
//         this.socket.emit(op, id, data);
//     }
// }

// TODO - since this comes back to a local socket.io... can I just attach the socket to the orderer
// and then have it express interest in a given broadcast topic?
// ... orderer.join()
//
// Need to just be able to subscribe an orderer to a room.
// Local case does a S.IO broadcast. And also sends message to any registered clients. I need
// a room concept - a S.IO one and a remote one.
// remote guy just broadcasts the other end to local clients.
// Then need to remove them as things come and go. So I don't think I need the socket below...?

// shouldn't a connect just register for everything we care about on the channel?
// Maybe I should end up passing it in?
//
// The kafka orderer knows it distributes w/ redis so should join the channel.
// The local orderer just manages individual conenctions and broadcasts across

// Should I just rename this to like connect?
// Or get the orderer and then call join?

//
// Oh - I know - move the majority of what is happening inside of this connect into the orderer.
// make the orderer do the connect message - it's part of the order joining - it also will know
// how to get messages to broadcast back, etc...
//

import * as builder from "botbuilder";
import * as DialogUtils from "../utils/DialogUtils";
import * as teams from "botbuilder-teams";
import { MongoDbAADObjectIdStorage } from "../storage/MongoDbAADObjectIdStorage";

export class SetAADObjectId implements builder.IMiddlewareMap {

    public readonly botbuilder = (session: builder.Session, next: Function): void => {
        let message = session.message;

        // let botStorage = await MongoDbAADObjectIdStorage.createConnection();
        // let x = {
        //     aadObjectId: "",
        //     vstsToken: "token",
        //     vstsRefreshToken: "refresh_token",
        // };
        // await botStorage.saveTokensByAADObjectId(x);
        // await botStorage.close();
        // next();

        if (message) {
            // console.log("User data: " + JSON.stringify(session.userData));
            if (session.userData.aadObjectId) {
                // Great! Do nothing.
                // console.log("Did nothing - woo");
                next();
            } else {
                // casting to keep away typescript errors
                let teamsChatConnector = (session.connector as teams.TeamsChatConnector);
                let msgAddress = (session.message.address as builder.IChatConnectorAddress);
                let msgServiceUrl = msgAddress.serviceUrl;

                // if a message is from a channel, use the team.id to fetch the roster
                let currId = null;
                if (DialogUtils.isMessageFromChannel(session.message)) {
                    currId = session.message.sourceEvent.team.id;
                } else {
                    currId = session.message.address.conversation.id;
                }

                teamsChatConnector.fetchMembers(
                    msgServiceUrl,
                    currId,
                    async (err, result) => {
                        if (!err) {
                            // get data for _id:aad_id - if doesn't exist, just add aad to userData
                            let aadObjectId = null;
                            for (let i = 0; i < result.length; i++) {
                                let curr = result[i];
                                if (curr.id === session.message.address.user.id) {
                                    aadObjectId = curr.objectId;
                                    break;
                                }
                            }
                            if (aadObjectId) {
                                session.userData.aadObjectId = aadObjectId;

                                let botStorage = await MongoDbAADObjectIdStorage.createConnection();
                                let entry = await botStorage.getEntryByAADObjectId(aadObjectId);

                                if (DialogUtils.isEmptyObj(entry)) {
                                    // no response from database so there is no entry from a tab first
                                    // console.log("Should have just saved AAD ID");
                                } else {
                                    // console.log("Should have saved AAD ID, tokens, and deleted aadObjectId: entry");
                                    // write data to user data
                                    let vstsAuth = {
                                        token: entry.vstsToken,
                                        refreshToken: entry.vstsRefreshToken,
                                    };
                                    session.userData.vstsAuth = vstsAuth;
                                    // delete AAD entry
                                    await botStorage.deleteEntryByAADObjectId(aadObjectId);
                                }
                                await botStorage.close();
                            }
                        } else {
                            session.error(err);
                        }
                        next();
                    },
                );

                // see if just addId exists
                // if it doesn't then just add addId to current session.userData
            }
        }
    }
}

import * as builder from "botbuilder";
import * as config from "config";

// Strip bot mentions from the message text
export class RestrictIncomingMessagesToTenants implements builder.IMiddlewareMap {

    public readonly botbuilder = (session: builder.Session, next: Function): void => {
      let targetTenant = config.office365TenantFilter;
      let currentMsgTenant = session.message.sourceEvent.tenant && session.message.sourceEvent.tenant.id;
      if (targetTenant && targetTenant !== "#ANY#") {
          if (targetTenant === currentMsgTenant) {
            next();
          } else {
            session.send("MS Teams: Attempted access from a different Office 365 tenant (" + currentMsgTenant + "): message rejected");
          }
        }
        else {
          next();
        }
    }
}

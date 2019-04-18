import * as builder from "botbuilder";
import { getLocaleFromEvent } from "../utils/DialogUtils";

// Set the textLocale field on message events so the botframework's automatic localization features take effect
export class SetLocaleFromTeamsSetting implements builder.IMiddlewareMap {

    public readonly receive = (event: builder.IEvent, next: Function): void => {
        let currEvent = (event as any);
        let locale = getLocaleFromEvent(event);
        if (locale) {
            currEvent.textLocale = locale;
        }
        next();
    }
}

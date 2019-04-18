import * as builder from "botbuilder";
import { BaseDialog } from "./BaseDialog";

export abstract class GlobalTriggerDialog extends BaseDialog {
    constructor(
        protected bot: builder.UniversalBot,
        protected dialogId: string,
        protected match: RegExp | RegExp[] | string | string[],
    ) {
        super(dialogId, {});

        bot.dialog(this.getDialogId(), this).triggerAction({
            matches: match,
        });
    }

    public addMatchesToDialog(parentDialog: builder.IntentDialog): void {
        // do nothing; match is added globally in constructor
    }
}

import * as builder from "botbuilder";
import { BaseTriggerActionDialog } from "./BaseTriggerActionDialog";
import { MultiTriggerActionDialogEntry } from "./DialogUtils";

export abstract class MultiTriggerActionDialog extends BaseTriggerActionDialog {

    constructor(
        protected bot: builder.UniversalBot,
        protected multiTriggerActionDialogEntryList: MultiTriggerActionDialogEntry[],
        protected constructorArgs?: any,
    ) {
        super(
            multiTriggerActionDialogEntryList ?
                multiTriggerActionDialogEntryList[0].dialogId :
                "Error: undefined dialogId",
        );

        if (multiTriggerActionDialogEntryList) {
            for (let i = 0; i < multiTriggerActionDialogEntryList.length; i++) {
                let currEntry = multiTriggerActionDialogEntryList[i];
                this.addDialogWithTriggerActionToBot(bot,
                    currEntry.dialogId,
                    currEntry.match,
                    currEntry.action,
                    constructorArgs,
                );
            }
        }
    }
}

import * as builder from "botbuilder";
import { BaseDialog } from "./BaseDialog";
import { DialogIds } from "./DialogIds";

export abstract class BaseTriggerActionDialog extends BaseDialog {

    constructor (
        protected dialogId: string,
    ) {
        super(dialogId);
    }

    protected addDialogWithTriggerActionToBot(
        bot: builder.UniversalBot,
        dialogId: string,
        match: RegExp | RegExp[] | string | string[],
        action: builder.IDialogWaterfallStep | builder.IDialogWaterfallStep[],
        constructorArgs?: any): void {
            let newActionList = new Array<builder.IDialogWaterfallStep>();
            newActionList.push((session, args, next) => { this.setDialogIdAsCurrent(session, args, next); });
            newActionList.push((session, args, next) => {
                if (constructorArgs) {
                    args.constructorArgs = constructorArgs;
                } else {
                    args.constructorArgs = {};
                }
                args.constructorArgs.bot = bot;
                next(args);
            });
            if (Array.isArray(action)) {
                newActionList = newActionList.concat((action as builder.IDialogWaterfallStep[]));
            } else {
                newActionList.push((action as builder.IDialogWaterfallStep));
            }

            bot.dialog(dialogId, newActionList)
                .triggerAction({
                    matches: match,
                });
    }

    private async setDialogIdAsCurrent(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        if (this.getDialogId() !== DialogIds.GetLastDialogUsedDialogId) {
            session.conversationData.currentDialogName = this.getDialogId();
        }
        next(args);
    }
}

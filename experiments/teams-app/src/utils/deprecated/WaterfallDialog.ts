import * as builder from "botbuilder";
import { BaseDialog } from "./BaseDialog";

export abstract class WaterfallDialog extends BaseDialog {
    constructor(
        protected dialogId: string,
        protected match: RegExp | RegExp[] | string | string[],
        protected action: builder.IDialogWaterfallStep | builder.IDialogWaterfallStep[],
    ) {
        super(dialogId, {});

        let newActionList = [];
        newActionList.push((session, args, next) => { this.setDialogIdAsCurrent(session, args, next); });
        newActionList.push((session, args, next) => {
            // tslint:disable-next-line:no-shadowed-variable
            this.onDefault((session, args, next) => { this._onDefault(session, args, next); });
            next(args);
        });
        if (Array.isArray(action)) {
            newActionList = newActionList.concat((action as builder.IDialogWaterfallStep[]));
        } else {
            newActionList.push((action as builder.IDialogWaterfallStep));
        }
        this.action = newActionList;
    }

    public getMatch(): RegExp | RegExp[] | string | string[] {
        return this.match;
    }

    public getAction(): builder.IDialogWaterfallStep | builder.IDialogWaterfallStep[] {
        return this.action;
    }

    public addMatchesToDialog(parentDialog: builder.IntentDialog): void {
        let matchEntry = this.getMatch();
        if (matchEntry === null) {
            return;
        }
        if (Array.isArray(matchEntry)) {
            parentDialog.matchesAny((matchEntry as RegExp[] | string[]), this.getAction());
        } else {
            parentDialog.matches((matchEntry as string | RegExp), this.getAction());
        }
    }

    protected _onBegin(session: builder.Session, args: any, next: (args?: builder.IDialogResult<any>) => void): void {
        session.userData.args = args;
        this.onDefault(this.getAction());
        next(args);
    }

    private async setDialogIdAsCurrent(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        session.conversationData.currentDialogName = this.dialogId;
        next(args);
    }
}

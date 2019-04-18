import * as builder from "botbuilder";
import { BaseDialog } from "./BaseDialog";

export abstract class OnBeginDialog extends BaseDialog {
    constructor(
        protected dialogId: string,
        protected match: RegExp | RegExp[] | string | string[],
    ) {
        super(dialogId, {});
    }

    public getMatch(): RegExp | RegExp[] | string | string[] {
        return this.match;
    }

    public addMatchesToDialog(parentDialog: builder.IntentDialog): void {
        let matchEntry = this.getMatch();
        if (matchEntry === null) {
            return;
        }
        if (Array.isArray(matchEntry)) {
            parentDialog.matchesAny((matchEntry as RegExp[] | string[]), this.getDialogId());
        } else {
            parentDialog.matches((matchEntry as string | RegExp), this.getDialogId());
        }
    }

    protected abstract _onBegin(session: builder.Session, args: any, next: (args?: builder.IDialogResult<any>) => void): void;
}

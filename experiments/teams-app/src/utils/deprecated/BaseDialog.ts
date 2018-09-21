import * as builder from "botbuilder";

export abstract class BaseDialog extends builder.IntentDialog {
    constructor (
        protected dialogId: string,
        protected dialogOptions: any,
    ) {
        super(dialogOptions);

        this.onBegin((session, args, next) => {
            if (this.getDialogId() !== "TestGlobalTriggerDialog") {
                session.conversationData.currentDialogName = this.dialogId;
            }
            this._onBegin(session, args, next);
        });

        this.onDefault((session, args, next) => { this._onDefault(session, args, next); });
    }

    public getDialogId(): string {
        return this.dialogId;
    }

    protected _onBegin(session: builder.Session, args: any, next: (args?: builder.IDialogResult<any>) => void): void {
        // do this unless overwritten

        next(args);
    }

    protected _onDefault(session: builder.Session, args: any, next: (args?: builder.IDialogResult<any>) => void): void {
        // do this unless overwritten

        session.send(session.gettext("I'm sorry, but there has been a problem") + " - " + this.dialogId);
        session.endDialog();
    }

    public abstract addMatchesToDialog(dialog: builder.IntentDialog): void;
}

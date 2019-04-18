export abstract class BaseDialog {

    constructor (
        protected dialogId: string,
    ) {
        // do nothing
    }

    protected getDialogId(): string {
        return this.dialogId;
    }
}

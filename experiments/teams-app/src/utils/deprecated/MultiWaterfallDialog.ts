import * as builder from "botbuilder";
import { BaseDialog } from "./BaseDialog";
import { MultiTriggerActionDialogEntry } from "./../DialogUtils";

// To extend this class - in the constructor of the new dialog the developer needs
// to set this.matchesList and then call DialogUtils.addMatches(this.matchesList, this);
export abstract class MultiWaterfallDialog extends BaseDialog {
    constructor(
        protected dialogId: string,
        protected multiTriggerActionDialogEntryList: MultiTriggerActionDialogEntry[],
    ) {
        super(dialogId, {});

        let resultList = [];
        if (multiTriggerActionDialogEntryList !== null) {
            for (let i = 0; i < multiTriggerActionDialogEntryList.length; i++) {
                let newActionList = [];
                newActionList.push((session, args, next) => { this.setDialogIdAsCurrent(session, args, next); });
                newActionList.push((session, args, next) => {
                    // tslint:disable-next-line:no-shadowed-variable
                    this.onDefault((session, args, next) => { this._onDefault(session, args, next); });
                    next(args);
                });
                if (Array.isArray(multiTriggerActionDialogEntryList[i].action)) {
                    newActionList = newActionList.concat((multiTriggerActionDialogEntryList[i].action as builder.IDialogWaterfallStep[]));
                } else {
                    newActionList.push((multiTriggerActionDialogEntryList[i].action as builder.IDialogWaterfallStep));
                }

                let temp = {
                    match: multiTriggerActionDialogEntryList[i].match,
                    action: newActionList,
                };

                resultList.push(temp);
            }

            this.multiTriggerActionDialogEntryList = resultList;
        }
    }

    public getMatchActionPairList(): MultiTriggerActionDialogEntry[] {
        let nonNullList = this.multiTriggerActionDialogEntryList;
        if (nonNullList === null || nonNullList === undefined) {
            nonNullList = [];
        }
        return nonNullList;
    }

    public addMatchesToDialog(parentDialog: builder.IntentDialog): void {
        let matchActionPairList = this.getMatchActionPairList();
        if (matchActionPairList === null) {
            return;
        }
        for (let i = 0; i < matchActionPairList.length; i++) {
            if (Array.isArray(matchActionPairList[i].match)) {
                parentDialog.matchesAny((matchActionPairList[i].match as string[] | RegExp[]), matchActionPairList[i].action);
            } else {
                parentDialog.matches((matchActionPairList[i].match as string | RegExp), matchActionPairList[i].action);
            }
        }
    }

    protected _onBegin(session: builder.Session, args: any, next: (args?: builder.IDialogResult<any>) => void): void {
        let matchActionPairList = this.getMatchActionPairList();

        let desiredIntent = args ? args.desiredIntent : null;
        let foundIntent = false;
        if (desiredIntent !== null && desiredIntent !== undefined) {
            for (let i = 0; i < matchActionPairList.length; i++) {
                let match = matchActionPairList[i].match;
                if (Array.isArray(match)) {
                    let currMatches = (match as RegExp[] | string[]);
                    for (let j = 0; j < currMatches.length; j++) {
                        if (currMatches[j] === desiredIntent) {
                            session.userData.args = args;
                            this.onDefault(matchActionPairList[i].action);
                            foundIntent = true;
                            break;
                        }
                    }
                } else {
                    let currMatch = (match as RegExp | string);
                    if (currMatch === desiredIntent) {
                        session.userData.args = args;
                        this.onDefault(matchActionPairList[i].action);
                        foundIntent = true;
                    }
                }
                if (foundIntent) {
                    break;
                }
            }
        }
        if (!foundIntent) {
            console.log("ERROR: desiredIntent, " + desiredIntent + ", for dialog, " + this.dialogId + ", could not be located in the matchActionPairList.");
            // tslint:disable-next-line:no-shadowed-variable
            this.onDefault((session, args, next) => { this._onDefault(session, args, next); });
        }

        next(args);
    }

    private async setDialogIdAsCurrent(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        session.conversationData.currentDialogName = this.dialogId;
        next(args);
    }
}

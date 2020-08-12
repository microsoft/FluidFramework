import { ApiDocumenterCommandLine } from './ApiDocumenterCommandLine';
import { BaseAction } from './BaseAction';
export declare class YamlAction extends BaseAction {
    private _officeParameter;
    private _newDocfxNamespacesParameter;
    constructor(parser: ApiDocumenterCommandLine);
    protected onDefineParameters(): void;
    protected onExecute(): Promise<void>;
}
//# sourceMappingURL=YamlAction.d.ts.map
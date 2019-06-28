export class View {
    get state() { return this._state; }
    mount(props) {
        this._state = this.mounting(props);
        return this._state.root;
    }
    update(props) {
        this._state = this.updating(props, this.state);
    }
    unmount() {
        this.unmounting(this.state);
        this.root.remove();
        this._state = undefined;
    }
    get root() { return this.state.root; }
}
export class FlowViewComponent extends View {
    get cursorTarget() { return this.state.cursorTarget; }
}
//# sourceMappingURL=index.js.map
import React from "react";
/**
 * Given a SharedString will produce a collaborative input element.
 */
export class CollaborativeInput extends React.Component {
    constructor(props) {
        super(props);
        this.inputElementRef = React.createRef();
        this.state = {
            selectionEnd: 0,
            selectionStart: 0,
        };
        this.handleInput = this.handleInput.bind(this);
        this.updateSelection = this.updateSelection.bind(this);
    }
    componentDidMount() {
        // Sets an event listener so we can update our state as the value changes
        this.props.sharedString.on("op", (op, local) => {
            if (!local) {
                this.updateInputFromSharedString();
            }
        });
        this.updateInputFromSharedString();
    }
    componentDidUpdate(prevProps) {
        // If the component gets a new sharedString props it needs to re-fetch the sharedString text
        if (prevProps.sharedString !== this.props.sharedString) {
            this.updateInputFromSharedString();
        }
    }
    render() {
        return (
        // There are a lot of different ways content can be inserted into a input box
        // and not all of them trigger a onBeforeInput event. To ensure we are grabbing
        // the correct selection before we modify the shared string we need to make sure
        // this.updateSelection is being called for multiple cases.
        React.createElement("input", { className: this.props.className, style: this.props.style, spellCheck: this.props.spellCheck ? this.props.spellCheck : true, ref: this.inputElementRef, onBeforeInput: this.updateSelection, onKeyDown: this.updateSelection, onClick: this.updateSelection, onContextMenu: this.updateSelection, onInput: this.handleInput }));
    }
    updateInputFromSharedString() {
        const text = this.props.sharedString.getText();
        if (this.inputElementRef.current && this.inputElementRef.current.value !== text) {
            this.inputElementRef.current.value = text;
        }
    }
    handleInput(ev) {
        var _a, _b;
        // We need to set the value here to keep the input responsive to the user
        const newText = ev.currentTarget.value;
        // Get the new caret position and use that to get the text that was inserted
        const newPosition = ev.currentTarget.selectionStart ? ev.currentTarget.selectionStart : 0;
        const isTextInserted = newPosition - this.state.selectionStart > 0;
        if (isTextInserted) {
            const insertedText = newText.substring(this.state.selectionStart, newPosition);
            const changeRangeLength = this.state.selectionEnd - this.state.selectionStart;
            if (changeRangeLength === 0) {
                this.props.sharedString.insertText(this.state.selectionStart, insertedText);
            }
            else {
                this.props.sharedString.replaceText(this.state.selectionStart, this.state.selectionEnd, insertedText);
            }
        }
        else {
            this.props.sharedString.removeText(newPosition, this.state.selectionEnd);
        }
        (_b = (_a = this.props).onInput) === null || _b === void 0 ? void 0 : _b.call(_a, this.props.sharedString);
    }
    /**
     * Update the current caret selection.
     * We need to do this before we do any handleInput action or we will have lost our
     * cursor position and not be able to accurately update the shared string.
     */
    updateSelection() {
        if (!this.inputElementRef.current) {
            return;
        }
        const selectionEnd = this.inputElementRef.current.selectionEnd ? this.inputElementRef.current.selectionEnd : 0;
        // eslint-disable-next-line max-len
        const selectionStart = this.inputElementRef.current.selectionStart ? this.inputElementRef.current.selectionStart : 0;
        this.setState({ selectionEnd, selectionStart });
    }
}
//# sourceMappingURL=CollaborativeInput.js.map
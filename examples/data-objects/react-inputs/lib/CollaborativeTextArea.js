import React from "react";
/**
 * Given a SharedString will produce a collaborative textarea.
 */
export class CollaborativeTextArea extends React.Component {
    constructor(props) {
        super(props);
        this.ref = React.createRef();
        this.state = {
            selectionEnd: 0,
            selectionStart: 0,
            text: this.props.sharedString.getText(),
        };
        this.handleChange = this.handleChange.bind(this);
        this.updateSelection = this.updateSelection.bind(this);
    }
    componentDidMount() {
        // Sets an event listener so we can update our state as the value changes
        this.props.sharedString.on("sequenceDelta", (event) => {
            const newText = this.props.sharedString.getText();
            // We only need to insert if the text changed.
            if (newText === this.state.text) {
                return;
            }
            // If the event is our own then just insert the text
            if (event.isLocal) {
                this.setState({ text: newText });
                return;
            }
            // Because we did not make the change we need to manage the remote
            // character insertion.
            const remoteCaretStart = event.first.position;
            const remoteCaretEnd = event.last.position + event.last.segment.cachedLength;
            const charactersModifiedCount = newText.length - this.state.text.length;
            this.updateSelection();
            const currentCaretStart = this.state.selectionStart;
            const currentCaretEnd = this.state.selectionEnd;
            let newCaretStart = 0;
            let newCaretEnd = 0;
            // Remote text inserted/removed after our cp range
            if (currentCaretEnd <= remoteCaretStart) {
                // cp stays where it was before.
                newCaretStart = currentCaretStart;
                newCaretEnd = currentCaretEnd;
            }
            else if (currentCaretStart > (remoteCaretEnd - 1)) {
                // Remote text inserted/removed before our cp range
                // We need to move our cp the number of characters inserted/removed
                // to ensure we are in the same position
                newCaretStart = currentCaretStart + charactersModifiedCount;
                newCaretEnd = currentCaretEnd + charactersModifiedCount;
            }
            else {
                // Remote text is overlapping cp
                // The remote changes occurred inside current selection
                if (remoteCaretEnd <= currentCaretEnd && remoteCaretStart > currentCaretStart) {
                    // Our selection needs to include remote changes
                    newCaretStart = currentCaretStart;
                    newCaretEnd = currentCaretEnd + charactersModifiedCount;
                }
                else if (remoteCaretEnd >= currentCaretEnd && remoteCaretStart <= currentCaretStart) {
                    // The remote changes encompass our location
                    // Our selection has been removed
                    // Move our cp to the beginning of the new text insertion
                    newCaretStart = remoteCaretStart;
                    newCaretEnd = remoteCaretStart;
                }
                else {
                    // We have partial overlapping selection with the changes.
                    // This makes things a lot harder to manage so for now we will just remove the current selection
                    // and place it to the remote caret start.
                    // TODO: implement this the correct way
                    newCaretStart = remoteCaretStart;
                    newCaretEnd = remoteCaretStart;
                }
            }
            this.setState({ text: newText });
            this.setCaretPosition(newCaretStart, newCaretEnd);
        });
    }
    setCaretPosition(newStart, newEnd) {
        if (this.ref.current) {
            this.ref.current.selectionStart = newStart;
            this.ref.current.selectionEnd = newEnd;
        }
    }
    // componentDidUpdate(){
    //     this.setCaretPosition(this.state.selectionStart, this.state.selectionEnd);
    // }
    render() {
        return (
        // There are a lot of different ways content can be inserted into a textarea
        // and not all of them trigger a onBeforeInput event. To ensure we are grabbing
        // the correct selection before we modify the shared string we need to make sure
        // this.updateSelection is being called for multiple cases.
        React.createElement("textarea", { rows: 20, cols: 50, ref: this.ref, className: this.props.className, style: this.props.style, spellCheck: this.props.spellCheck ? this.props.spellCheck : false, onBeforeInput: this.updateSelection, onKeyDown: this.updateSelection, onClick: this.updateSelection, onContextMenu: this.updateSelection, 
            // onChange is recommended over onInput for React controls
            // https://medium.com/capital-one-tech/how-to-work-with-forms-inputs-and-events-in-react-c337171b923b
            onChange: this.handleChange, value: this.state.text }));
    }
    handleChange(ev) {
        // We need to set the value here to keep the input responsive to the user
        const newText = ev.currentTarget.value;
        const charactersModifiedCount = this.state.text.length - newText.length;
        this.setState({ text: newText });
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
            // Text was removed
            this.props.sharedString.removeText(newPosition, newPosition + charactersModifiedCount);
        }
    }
    /**
     * Update the current caret selection.
     * We need to do this before we do any handleChange action or we will have lost our
     * cursor position and not be able to accurately update the shared string.
     */
    updateSelection() {
        if (!this.ref.current) {
            return;
        }
        const selectionEnd = this.ref.current.selectionEnd ? this.ref.current.selectionEnd : 0;
        const selectionStart = this.ref.current.selectionStart ? this.ref.current.selectionStart : 0;
        this.setState({ selectionEnd, selectionStart });
    }
}
//# sourceMappingURL=CollaborativeTextArea.js.map
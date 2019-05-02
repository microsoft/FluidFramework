import * as React from "react";

// This let's us pull in a template html page as a string to inject later into the iframe
import template from './innerComponent/template.html';

interface p {
    getText: () => string,
    getDocumentId: () => string,
    onLoad: Promise<void>,
    style: React.CSSProperties,
    iframeId: string,
}

interface s {
    code: string;
}

export class LocalChaincode extends React.PureComponent<p, s> {
    constructor(props: p) {
        super(props);
        this.state = {
            code: ""
        }

        this.updateText = this.updateText.bind(this);
        this.generateIframeScript = this.generateIframeScript.bind(this);
    }

    updateText() {
        const newText = this.props.getText();
        this.setState({ code: newText });
    }

    componentDidMount() {
        const self = this;
        this.props.onLoad.then(() => {
            self.setState({ code: self.props.getText() })
        });
    }

    generateIframeScript() {
        return `${template}
      <script>window.documentId = "${this.props.getDocumentId()}";</script>
      <script>
        window.loadLocalCode = () => {
          window.main = { 
              MyApp: () => new MyApp(),
              instantiateRuntime: f => instantiateRuntime(f)
          };
  
          Document = window.skeleton.Document;
          Component = window.skeleton.Component;
  

          ${this.state.code}
        };
      </script>
      `
    }

    render() {
        const buttonStyle = {
            width: this.props.style.width,
            height: "3vh",
            bottom: 0,
            position: "absolute",
        } as React.CSSProperties;

        const iframeStyle = {
            height: "70vh",
            width: "50vw",
            top: 0,
            position: "absolute",
            border: "0",
            borderLeft: "1px dotted darkgray",
        } as React.CSSProperties

        return (
            <div style={this.props.style}>
                <iframe srcDoc={this.generateIframeScript()} style={iframeStyle} />
                <button onClick={this.updateText} style={buttonStyle}>UPDATE (DocId: {this.props.getDocumentId()})</button>
            </div>
        );
    }
}
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as $ from "jquery";

// import * as $ from 'jquery'
import InkCanvas from './inkcanvas'
// import InkGeometry from './inkgeometry'
// import Tools from './tools'

export interface WhiteboardProps { 

}
export interface WhiteboardState { 
    selectedPen? : string; // color
    width? : number;
    height? : number;
}

export class Whiteboard extends React.Component<WhiteboardProps, WhiteboardState> {
	constructor(props : WhiteboardProps) {
        super(props);

        this.state = {
			selectedPen: '#000',
            width: $(window).innerWidth(),
            height: $(window).innerHeight()
        }

        $(window).resize(this.resize);

        this.selectPen = this.selectPen.bind(this);
        this.resize = this.resize.bind(this);
    }
	resize() {
		this.setState({ 
			width: $(window).innerWidth(),
			height: $(window).innerHeight()
		});
    }
    selectPen(color : string) {
        this.setState({ selectedPen: color })
    }
    render() {
		return (
            <div>
                {/*onDragOver={this.dragOver} onDrop={this.dropFiles} */}
                <InkCanvas width={this.state.width} height={this.state.height} inkColor={this.state.selectedPen} />

            {/*
                <Tools selectedPen={this.state.selectedPen} onPenSelected={this.selectPen} />
            */}
			</div>
		);
	}
}

export default Whiteboard
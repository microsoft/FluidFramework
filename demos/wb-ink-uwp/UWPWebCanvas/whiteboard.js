import React from 'react'
import ReactDOM from 'react-dom'

import InkCanvas from './inkcanvas'
import InkGeometry from './inkgeometry'
import Tools from './tools'

class Whiteboard extends React.Component {
	constructor(props) {
        super(props);

        this.state = {
			selectedPen: '#000',
            width: $(window).innerWidth(),
            height: $(window).innerHeight()
        }

        $(window).resize(this.resize)

        this.selectPen = this.selectPen.bind(this)
    }
	resize() {
		this.setState({
			width: $(window).innerWidth(),
			height: $(window).innerHeight()
		})
    }
    selectPen(color) {
        this.setState({ selectedPen: color })
    }
    render() {
		return (
            <div onDragOver={this.dragOver} onDrop={this.dropFiles}>
                <InkCanvas width={this.state.width} height={this.state.height - 60} inkColor={this.state.selectedPen} />
                <Tools selectedPen={this.state.selectedPen} onPenSelected={this.selectPen} />
			</div>
		);
	}
}

export default Whiteboard
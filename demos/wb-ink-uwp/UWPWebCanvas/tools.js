import React from 'react'
import ReactDOM from 'react-dom'
import InkColorSelector from './inkcolorselector'

class Tools extends React.Component {
	constructor(props) {
		super(props);
		this.state = {
			inkcolors: ['#000', '#f00', '#00f', '#0f0', '#ff0', '#f0f', 'rainbow'],
		}
    }
	render() {
		return (
			<div id="toolpanel">
				{this.state.inkcolors.map((color, i) => {
					return (
                        <InkColorSelector key={i} ref={i} id={i} size="40" color={color} selected={color == this.props.selectedPen} onSelect={this.props.onPenSelected}></InkColorSelector>)
				})}
			</div>
		)
	}
}

export default Tools

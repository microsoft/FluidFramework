use fluid_wasm_add::add as add_core;
use fluid_wasm_subtract::subtract as subtract_core;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn add(left: f64, right: f64) -> f64{
	add_core(left, right)
}

#[wasm_bindgen]
pub fn subtract(left: f64, right: f64) -> f64{
	subtract_core(left, right)
}
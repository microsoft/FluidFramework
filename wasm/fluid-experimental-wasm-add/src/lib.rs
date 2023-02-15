use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn add(left: f64, right: f64) -> f64{
    left + right
}

#[cfg(test)]
pub mod test {
    use crate::add;
    #[test]
    pub fn adds_correctly() {
        assert_eq!(add(1 as f64, 2 as f64), 3 as f64);
    }
}

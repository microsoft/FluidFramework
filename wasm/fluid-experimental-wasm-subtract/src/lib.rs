use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn subtract(left: f64, right: f64) -> f64 {
    left - right
}

#[cfg(test)]
pub mod test {
    use crate::subtract;
    #[test]
    pub fn subtracts_correctly() {
        assert_eq!(subtract(2 as f64, 1 as f64), 1 as f64);
    }
}

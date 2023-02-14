use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn add(left: usize, right: usize) -> usize {
    left + right
}

#[cfg(test)]
pub mod test {
    use crate::add;
    #[test]
    pub fn adds_correctly() {
        assert_eq!(add(1, 2), 3);
    }
}

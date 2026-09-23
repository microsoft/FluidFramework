//! Reports syntax-derived Rust test-item line spans for source inventory only.

use syn::{Attribute, spanned::Spanned as _, visit::Visit};

/// Nonoverlapping outer test-item spans, including attributes and documentation.
#[derive(Default)]
struct TestSpans(Vec<(usize, usize)>);

/// Recognizes explicit test gates and standard test function attributes.
fn test_attributes(attributes: &[Attribute]) -> bool {
    attributes.iter().any(|attribute| {
        attribute
            .path()
            .segments
            .last()
            .is_some_and(|segment| segment.ident == "test")
            || (attribute.path().is_ident("cfg")
                && attribute
                    .parse_args::<syn::Path>()
                    .is_ok_and(|path| path.is_ident("test")))
    })
}

impl<'syntax> Visit<'syntax> for TestSpans {
    fn visit_item_mod(&mut self, item: &'syntax syn::ItemMod) {
        if test_attributes(&item.attrs) {
            self.0
                .push((item.span().start().line, item.span().end().line));
        } else {
            syn::visit::visit_item_mod(self, item);
        }
    }

    fn visit_item_fn(&mut self, item: &'syntax syn::ItemFn) {
        if test_attributes(&item.attrs) {
            self.0
                .push((item.span().start().line, item.span().end().line));
        } else {
            syn::visit::visit_item_fn(self, item);
        }
    }
}

/// Emits per-file spans without modifying source or relying on brace matching.
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut result = serde_json::Map::new();
    for path in std::env::args().skip(1) {
        let syntax = syn::parse_file(&std::fs::read_to_string(&path)?)?;
        let mut spans = TestSpans::default();
        spans.visit_file(&syntax);
        result.insert(path, serde_json::to_value(spans.0)?);
    }
    println!("{}", serde_json::Value::Object(result));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_outer_test_modules_and_ignores_braces_in_strings() {
        let source = "fn production() {}\n#[cfg(test)]\nmod tests {\n #[test] fn one() { let _text = \"}\"; }\n}\n#[tokio::test]\nasync fn two() {}\n";
        let mut spans = TestSpans::default();
        spans.visit_file(&syn::parse_file(source).unwrap());
        assert_eq!(spans.0, vec![(2, 5), (6, 7)]);
    }
}

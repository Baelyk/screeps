use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn greet() {
    log("Hello, World!");
}

#[wasm_bindgen]
extern "C" {
    // Use `js_namespace` here to bind `console.log(..)` instead of just
    // `log(..)`
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

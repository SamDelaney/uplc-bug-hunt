//! Browser-facing UPLC evaluator built on Aiken's `uplc` crate.
//!
//! Every entry point takes and returns plain strings (JSON for structured results), so the
//! JS side needs no serde glue and a failure never escapes as an exception.

use serde_json::{json, Value};
use uplc::{
    ast::{Name, NamedDeBruijn, Program, Term},
    machine::cost_model::ExBudget,
    parser,
};
use wasm_bindgen::prelude::*;

/// Version of the `uplc` crate doing the evaluating (kept in step with Cargo.toml).
#[wasm_bindgen]
pub fn engine_version() -> String {
    "uplc 1.1.21".into()
}

/// Parse, apply `args_json` (a JSON array of UPLC term strings) and evaluate.
///
/// Returns JSON: `{ ok, stage, result, error, cpu, mem, logs, size }`. `stage` names where a
/// failure happened: `args`, `parse`, `version`, `scope` or `eval`. `size` is the flat-encoded
/// size in bytes of the program as written, before arguments are applied.
#[wasm_bindgen]
pub fn evaluate(source: &str, args_json: &str, cpu: f64, mem: f64) -> String {
    run(source, args_json, cpu as i64, mem as i64).to_string()
}

/// Parse a term and pretty-print it, so expected answers can be compared in canonical form.
/// Returns JSON: `{ ok, text, error }`.
#[wasm_bindgen]
pub fn normalize(term: &str) -> String {
    match parser::term(term) {
        Ok(t) => json!({ "ok": true, "text": t.to_pretty() }),
        Err(e) => json!({ "ok": false, "error": e.to_string() }),
    }
    .to_string()
}

fn fail(stage: &str, error: impl ToString) -> Value {
    json!({ "ok": false, "stage": stage, "error": error.to_string() })
}

fn run(source: &str, args_json: &str, cpu: i64, mem: i64) -> Value {
    let args: Vec<String> = match serde_json::from_str(args_json) {
        Ok(a) => a,
        Err(e) => return fail("args", e),
    };

    let mut program = match parser::program(source) {
        Ok(p) => p,
        Err(e) => return fail("parse", e),
    };

    // The reference parser rejects these before 1.1.0; uplc's parser accepts them.
    if program.version < (1, 1, 0) && uses_sop(&program.term) {
        return fail("version", "'constr' and 'case' are not allowed before version 1.1.0");
    }

    let size = program
        .clone()
        .to_debruijn()
        .ok()
        .and_then(|p| p.to_flat().ok())
        .map(|bytes| bytes.len());

    for (i, arg) in args.iter().enumerate() {
        match parser::term(arg) {
            Ok(t) => program = program.apply_term(&t),
            Err(e) => return fail("args", format!("argument {}: {}", i + 1, e)),
        }
    }

    let program = match Program::<NamedDeBruijn>::try_from(program) {
        Ok(p) => p,
        Err(e) => return fail("scope", e),
    };

    let eval = program.eval(ExBudget { cpu, mem });
    let cost = eval.cost();
    let logs = eval.logs();

    match eval.result() {
        Ok(term) => {
            let text = Term::<Name>::try_from(term)
                .map(|t| t.to_pretty())
                .unwrap_or_else(|e| format!("<unprintable: {e}>"));
            json!({
                "ok": true, "stage": "eval", "result": text,
                "cpu": cost.cpu, "mem": cost.mem, "logs": logs, "size": size,
            })
        }
        Err(e) => json!({
            "ok": false, "stage": "eval", "error": e.to_string(),
            "cpu": cost.cpu, "mem": cost.mem, "logs": logs, "size": size,
        }),
    }
}

fn uses_sop(term: &Term<Name>) -> bool {
    match term {
        Term::Constr { .. } | Term::Case { .. } => true,
        Term::Delay(t) | Term::Force(t) => uses_sop(t),
        Term::Lambda { body, .. } => uses_sop(body),
        Term::Apply { function, argument } => uses_sop(function) || uses_sop(argument),
        _ => false,
    }
}

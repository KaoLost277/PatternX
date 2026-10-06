# Readability-First Coding Rules

Apply these standards to all code written or changed by the team or agents in this project.

## 1. Clear, expanded code

- Write code for readability rather than compression or minification.
- Avoid complex one-liners and nested ternary operators. Use explicit `if`/`else` or `switch` blocks for conditional logic.
- Keep standard, idiomatic syntax such as optional chaining, destructuring, simple arrow functions, and `map`/`filter` when it makes the code clear.

## 2. Descriptive names

- Use complete, meaningful names for variables, functions, and other identifiers so their roles are clear from context.
- Avoid vague names and abbreviations such as `temp`, `a`, `b`, `arr`, and `fn`.
- Use conventional short names only when they are unambiguous in context, such as `i` for a simple loop index or `x` and `y` for mathematical coordinates.

## 3. Step-by-step flow

- Express each logical operation or decision clearly, generally one per line.
- Break multi-step logic into named intermediate values and conventional control-flow blocks when that makes the sequence easier to follow.
- Avoid packing multiple statements or unrelated operations onto one line. Keep ordinary expressions intact when they remain easy to read.

## 4. Comments explain rationale

- Add concise comments to explain non-obvious reasons, constraints, or tradeoffs behind a step.
- Do not add line-by-line comments that merely restate what clear code already does.

## 5. Standard language structures

- Prefer familiar, idiomatic structures for the language and project.
- Avoid tricks or niche syntax when a straightforward standard construct communicates the intent more clearly.

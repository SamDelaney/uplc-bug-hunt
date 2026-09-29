// Practice problems. Each test applies `args` (UPLC terms) to the program in order, then either
// compares the result with `expect` (a UPLC term, compared in canonical form) or, with
// `fails: true`, passes only if evaluation fails. `reference` is a known-good solution: its
// costs are what a submission is ranked against, and scripts/verify.mjs checks it passes.
const PROBLEMS = [
  {
    id: "abs",
    title: "Absolute value",
    difficulty: "easy",
    statement: "Given an integer n, return its absolute value.",
    starter: `(program 1.1.0
  (lam n
    n))`,
    tests: [
      { args: ["(con integer 5)"], expect: "(con integer 5)" },
      { args: ["(con integer -5)"], expect: "(con integer 5)" },
      { args: ["(con integer 0)"], expect: "(con integer 0)" },
      { args: ["(con integer -123456789012345678901234567890)"], expect: "(con integer 123456789012345678901234567890)" },
    ],
    reference: `(program 1.1.0
  (lam n
    [ (force (builtin ifThenElse))
      [ (builtin lessThanInteger) n (con integer 0) ]
      [ (builtin subtractInteger) (con integer 0) n ]
      n ]))`,
  },
  {
    id: "is-even",
    title: "Is it even?",
    difficulty: "easy",
    statement: "Given any integer n, including negative ones, return (con bool True) if it is even and (con bool False) otherwise.",
    starter: `(program 1.1.0
  (lam n
    (con bool False)))`,
    tests: [
      { args: ["(con integer 4)"], expect: "(con bool True)" },
      { args: ["(con integer 7)"], expect: "(con bool False)" },
      { args: ["(con integer 0)"], expect: "(con bool True)" },
      { args: ["(con integer -3)"], expect: "(con bool False)" },
      { args: ["(con integer -4)"], expect: "(con bool True)" },
    ],
    reference: `(program 1.1.0
  (lam n
    [ (builtin equalsInteger)
      [ (builtin modInteger) n (con integer 2) ]
      (con integer 0) ]))`,
  },
  {
    id: "safe-head",
    title: "Head or zero",
    difficulty: "medium",
    statement: "Given a list of integers, return its first element, or (con integer 0) if the list is empty.",
    starter: `(program 1.1.0
  (lam xs
    [ (force (builtin headList)) xs ]))`,
    tests: [
      { args: ["(con (list integer) [7, 8, 9])"], expect: "(con integer 7)" },
      { args: ["(con (list integer) [])"], expect: "(con integer 0)" },
      { args: ["(con (list integer) [-1])"], expect: "(con integer -1)" },
    ],
    reference: `(program 1.1.0
  (lam xs
    (force
      [ (force (force (builtin chooseList)))
        xs
        (delay (con integer 0))
        (delay [ (force (builtin headList)) xs ]) ])))`,
  },
  {
    id: "min-deposit",
    title: "Minimum deposit validator",
    difficulty: "medium",
    statement:
      "A PlutusV3-style check. Given an amount in lovelace, succeed by returning (con unit ()) if it is at least 2 ADA (2,000,000 lovelace), and fail otherwise.",
    starter: `(program 1.1.0
  (lam lovelace
    (con unit ())))`,
    tests: [
      { args: ["(con integer 2000000)"], expect: "(con unit ())" },
      { args: ["(con integer 5000000)"], expect: "(con unit ())" },
      { args: ["(con integer 1999999)"], fails: true },
      { args: ["(con integer 0)"], fails: true },
    ],
    reference: `(program 1.1.0
  (lam lovelace
    (force
      [ (force (builtin ifThenElse))
        [ (builtin lessThanEqualsInteger) (con integer 2000000) lovelace ]
        (delay (con unit ()))
        (delay (error)) ])))`,
  },
  {
    id: "sum-list",
    title: "Sum a list",
    difficulty: "hard",
    statement: "Given a list of integers, return their sum. The empty list sums to 0. You will need recursion.",
    starter: `(program 1.1.0
  (lam xs
    (con integer 0)))`,
    tests: [
      { args: ["(con (list integer) [])"], expect: "(con integer 0)" },
      { args: ["(con (list integer) [1, 2, 3])"], expect: "(con integer 6)" },
      { args: ["(con (list integer) [5, -5, 10])"], expect: "(con integer 10)" },
      {
        args: ["(con (list integer) [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20])"],
        expect: "(con integer 210)",
      },
    ],
    reference: `(program 1.1.0
  [ (lam f
      [ (lam x [ f (lam v [ x x v ]) ])
        (lam x [ f (lam v [ x x v ]) ]) ])
    (lam self
      (lam xs
        (force
          [ (force (force (builtin chooseList)))
            xs
            (delay (con integer 0))
            (delay [ (builtin addInteger)
                     [ (force (builtin headList)) xs ]
                     [ self [ (force (builtin tailList)) xs ] ] ]) ]))) ])`,
  },
];

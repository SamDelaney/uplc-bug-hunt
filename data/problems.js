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
  {
    id: "max-of-two",
    title: "Larger of two",
    difficulty: "easy",
    statement: "Given two integers a and b, return the larger one.",
    starter: `(program 1.1.0
  (lam a
    (lam b
      a)))`,
    tests: [
      { args: ["(con integer 3)", "(con integer 9)"], expect: "(con integer 9)" },
      { args: ["(con integer 9)", "(con integer 3)"], expect: "(con integer 9)" },
      { args: ["(con integer -2)", "(con integer -8)"], expect: "(con integer -2)" },
      { args: ["(con integer 4)", "(con integer 4)"], expect: "(con integer 4)" },
    ],
    reference: `(program 1.1.0
  (lam a
    (lam b
      [ (force (builtin ifThenElse))
        [ (builtin lessThanInteger) a b ]
        b
        a ])))`,
  },
  {
    id: "is-key-hash",
    title: "Key hash shape",
    difficulty: "easy",
    statement:
      "Given a bytestring, return (con bool True) if it is the right length to be a Cardano key hash (28 bytes) and (con bool False) otherwise.",
    starter: `(program 1.1.0
  (lam bs
    (con bool True)))`,
    tests: [
      { args: ["(con bytestring #abababababababababababababababababababababababababababab)"], expect: "(con bool True)" },
      { args: ["(con bytestring #abababababababababababababababababababababababababababababababab)"], expect: "(con bool False)" },
      { args: ["(con bytestring #)"], expect: "(con bool False)" },
      { args: ["(con bytestring #00)"], expect: "(con bool False)" },
    ],
    reference: `(program 1.1.0
  (lam bs
    [ (builtin equalsInteger)
      [ (builtin lengthOfByteString) bs ]
      (con integer 28) ]))`,
  },
  {
    id: "reference-token-name",
    title: "Reference token name",
    difficulty: "easy",
    statement:
      "Given a base asset name, return the CIP-68 reference token name: the 4-byte label #000643b0 followed by the base name.",
    starter: `(program 1.1.0
  (lam baseName
    baseName))`,
    tests: [
      { args: ["(con bytestring #cafe)"], expect: "(con bytestring #000643b0cafe)" },
      { args: ["(con bytestring #)"], expect: "(con bytestring #000643b0)" },
      { args: ["(con bytestring #0102030405)"], expect: "(con bytestring #000643b00102030405)" },
    ],
    reference: `(program 1.1.0
  (lam baseName
    [ (builtin appendByteString) (con bytestring #000643b0) baseName ]))`,
  },
  {
    id: "after-deadline",
    title: "After the deadline",
    difficulty: "medium",
    statement:
      "A PlutusV3-style check. Given a deadline and the current time (both integers), succeed by returning (con unit ()) only if the current time is strictly after the deadline. Fail otherwise.",
    starter: `(program 1.1.0
  (lam deadline
    (lam now
      (con unit ()))))`,
    tests: [
      { args: ["(con integer 100)", "(con integer 101)"], expect: "(con unit ())" },
      { args: ["(con integer 0)", "(con integer 5000)"], expect: "(con unit ())" },
      { args: ["(con integer 100)", "(con integer 100)"], fails: true },
      { args: ["(con integer 100)", "(con integer 99)"], fails: true },
    ],
    reference: `(program 1.1.0
  (lam deadline
    (lam now
      (force
        [ (force (builtin ifThenElse))
          [ (builtin lessThanInteger) deadline now ]
          (delay (con unit ()))
          (delay (error)) ]))))`,
  },
  {
    id: "two-of-three",
    title: "Two of three",
    difficulty: "medium",
    statement:
      "A multisig check. Given three booleans saying whether each of three keys signed, succeed by returning (con unit ()) if at least two are True. Fail otherwise.",
    starter: `(program 1.1.0
  (lam a
    (lam b
      (lam c
        (con unit ())))))`,
    tests: [
      { args: ["(con bool True)", "(con bool True)", "(con bool False)"], expect: "(con unit ())" },
      { args: ["(con bool True)", "(con bool False)", "(con bool True)"], expect: "(con unit ())" },
      { args: ["(con bool False)", "(con bool True)", "(con bool True)"], expect: "(con unit ())" },
      { args: ["(con bool True)", "(con bool True)", "(con bool True)"], expect: "(con unit ())" },
      { args: ["(con bool True)", "(con bool False)", "(con bool False)"], fails: true },
      { args: ["(con bool False)", "(con bool False)", "(con bool True)"], fails: true },
      { args: ["(con bool False)", "(con bool False)", "(con bool False)"], fails: true },
    ],
    reference: `(program 1.1.0
  (lam a
    (lam b
      (lam c
        (force
          [ (force (builtin ifThenElse))
            [ (force (builtin ifThenElse))
              a
              [ (force (builtin ifThenElse)) b (con bool True) c ]
              [ (force (builtin ifThenElse)) b c (con bool False) ] ]
            (delay (con unit ()))
            (delay (error)) ])))))`,
  },
  {
    id: "datum-second-field",
    title: "Deadline from a datum",
    difficulty: "medium",
    statement:
      "The datum is a Data constructor whose second field is an integer deadline, for example Constr 0 [B owner, I deadline]. Return the deadline as an integer.",
    starter: `(program 1.1.0
  (lam datum
    (con integer 0)))`,
    tests: [
      { args: ["(con data (Constr 0 [B #aabb, I 1000]))"], expect: "(con integer 1000)" },
      { args: ["(con data (Constr 1 [I 5, I 7, I 9]))"], expect: "(con integer 7)" },
      { args: ["(con data (Constr 0 [B #, I -3]))"], expect: "(con integer -3)" },
    ],
    reference: `(program 1.1.0
  (lam datum
    [ (builtin unIData)
      [ (force (builtin headList))
        [ (force (builtin tailList))
          [ (force (force (builtin sndPair)))
            [ (builtin unConstrData) datum ] ] ] ] ]))`,
  },
  {
    id: "list-length",
    title: "Length of a list",
    difficulty: "medium",
    statement: "Given a list of integers, return how many elements it has. You will need recursion.",
    starter: `(program 1.1.0
  (lam xs
    (con integer 0)))`,
    tests: [
      { args: ["(con (list integer) [])"], expect: "(con integer 0)" },
      { args: ["(con (list integer) [42])"], expect: "(con integer 1)" },
      { args: ["(con (list integer) [5, 5, 5, 5])"], expect: "(con integer 4)" },
      { args: ["(con (list integer) [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25])"], expect: "(con integer 25)" },
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
                     (con integer 1)
                     [ self [ (force (builtin tailList)) xs ] ] ]) ]))) ])`,
  },
  {
    id: "contains",
    title: "Is it in the list?",
    difficulty: "hard",
    statement:
      "Given a list of integers and an integer x, return (con bool True) if x appears in the list and (con bool False) otherwise.",
    starter: `(program 1.1.0
  (lam xs
    (lam x
      (con bool False))))`,
    tests: [
      { args: ["(con (list integer) [1, 2, 3])", "(con integer 2)"], expect: "(con bool True)" },
      { args: ["(con (list integer) [1, 2, 3])", "(con integer 4)"], expect: "(con bool False)" },
      { args: ["(con (list integer) [])", "(con integer 0)"], expect: "(con bool False)" },
      { args: ["(con (list integer) [7, 7, 7, -9])", "(con integer -9)"], expect: "(con bool True)" },
    ],
    reference: `(program 1.1.0
  (lam xs
    (lam x
      [ [ (lam f
            [ (lam y [ f (lam v [ y y v ]) ])
              (lam y [ f (lam v [ y y v ]) ]) ])
          (lam self
            (lam ys
              (force
                [ (force (force (builtin chooseList)))
                  ys
                  (delay (con bool False))
                  (delay
                    (force
                      [ (force (builtin ifThenElse))
                        [ (builtin equalsInteger) [ (force (builtin headList)) ys ] x ]
                        (delay (con bool True))
                        (delay [ self [ (force (builtin tailList)) ys ] ]) ])) ]))) ]
        xs ])))`,
  },
  {
    id: "reverse-list",
    title: "Reverse a list",
    difficulty: "hard",
    statement: "Given a list of integers, return a list with the same elements in reverse order.",
    starter: `(program 1.1.0
  (lam xs
    xs))`,
    tests: [
      { args: ["(con (list integer) [1, 2, 3])"], expect: "(con (list integer) [3, 2, 1])" },
      { args: ["(con (list integer) [])"], expect: "(con (list integer) [])" },
      { args: ["(con (list integer) [9])"], expect: "(con (list integer) [9])" },
      { args: ["(con (list integer) [1, 1, 2, 3, 5, 8])"], expect: "(con (list integer) [8, 5, 3, 2, 1, 1])" },
    ],
    reference: `(program 1.1.0
  (lam xs
    [ [ (lam f
          [ (lam y [ f (lam v [ y y v ]) ])
            (lam y [ f (lam v [ y y v ]) ]) ])
        (lam self
          (lam ys
            (lam acc
              (force
                [ (force (force (builtin chooseList)))
                  ys
                  (delay acc)
                  (delay
                    [ self
                      [ (force (builtin tailList)) ys ]
                      [ (force (builtin mkCons)) [ (force (builtin headList)) ys ] acc ] ]) ])))) ]
      xs
      (con (list integer) []) ]))`,
  },
  {
    id: "fibonacci",
    title: "Fibonacci",
    difficulty: "hard",
    statement:
      "Given n (0 or more), return the nth Fibonacci number, where fib 0 = 0 and fib 1 = 1. The tests go up to n = 90, so a solution that recomputes smaller values will run out of budget.",
    starter: `(program 1.1.0
  (lam n
    n))`,
    tests: [
      { args: ["(con integer 0)"], expect: "(con integer 0)" },
      { args: ["(con integer 1)"], expect: "(con integer 1)" },
      { args: ["(con integer 2)"], expect: "(con integer 1)" },
      { args: ["(con integer 10)"], expect: "(con integer 55)" },
      { args: ["(con integer 30)"], expect: "(con integer 832040)" },
      { args: ["(con integer 90)"], expect: "(con integer 2880067194370816120)" },
    ],
    reference: `(program 1.1.0
  (lam n
    [ [ (lam f
          [ (lam y [ f (lam v [ y y v ]) ])
            (lam y [ f (lam v [ y y v ]) ]) ])
        (lam self
          (lam k
            (lam a
              (lam b
                (force
                  [ (force (builtin ifThenElse))
                    [ (builtin equalsInteger) k (con integer 0) ]
                    (delay a)
                    (delay
                      [ self
                        [ (builtin subtractInteger) k (con integer 1) ]
                        b
                        [ (builtin addInteger) a b ] ]) ]))))) ]
      n
      (con integer 0)
      (con integer 1) ]))`,
  },
];

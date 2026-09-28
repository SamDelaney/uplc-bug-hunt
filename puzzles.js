// Each puzzle: the first option is the correct one (options are shuffled at runtime).
// `context` states what the code is *meant* to do; the bug is the gap between that and the code.
const PUZZLES = [
  {
    id: "missing-force",
    title: "Unforced polymorphic builtin",
    difficulty: "easy",
    context: 'Returns "small" when n < 10, otherwise "big".',
    code: `(program 1.1.0
  (lam n
    [ (builtin ifThenElse)
      [ (builtin lessThanInteger) n (con integer 10) ]
      (con string "small")
      (con string "big") ]))`,
    options: [
      "ifThenElse is polymorphic, so it must be forced once before it accepts term arguments",
      "lessThanInteger takes its arguments in the opposite order",
      "String constants aren't allowed in UPLC, so these must be bytestrings",
      "lam binders need a type annotation",
    ],
    explain:
      "ifThenElse has the type ∀a. bool → a → a → a. Every type variable costs one force before the first term argument. UPLC is untyped, so the force is all that's left of the type instantiation, but the evaluator still insists on it. Applying a term to an unforced polymorphic builtin is an evaluation failure.",
    fix: `(program 1.1.0
  (lam n
    [ (force (builtin ifThenElse))
      [ (builtin lessThanInteger) n (con integer 10) ]
      (con string "small")
      (con string "big") ]))`,
  },
  {
    id: "strict-branches",
    title: "Eager error branch",
    difficulty: "easy",
    context: "Succeeds if the owner signed, otherwise fails with a trace message.",
    code: `(program 1.1.0
  (lam signed
    [ (force (builtin ifThenElse))
      signed
      (con unit ())
      [ (force (builtin trace)) (con string "not signed") (error) ] ]))`,
    options: [
      "Builtin arguments are evaluated first, so the (error) branch runs before ifThenElse looks at signed. It always fails",
      "trace needs two forces, not one",
      "(con unit ()) is not a valid constant",
      "signed must be forced before it can be used as a condition",
    ],
    explain:
      "UPLC is call-by-value: all three arguments to ifThenElse are evaluated before the builtin runs, including the failing branch. The standard pattern is to delay both branches, let ifThenElse pick one of the delayed values, and force the result.",
    fix: `(program 1.1.0
  (lam signed
    (force
      [ (force (builtin ifThenElse))
        signed
        (delay (con unit ()))
        (delay [ (force (builtin trace)) (con string "not signed") (error) ]) ])))`,
  },
  {
    id: "free-variable",
    title: "Out of scope",
    difficulty: "easy",
    context: "Defines double n = n + n and applies it to 21.",
    code: `(program 1.1.0
  [ (lam double
      [ double (con integer 21) ])
    (lam n
      [ (builtin addInteger) n m ]) ])`,
    options: [
      "m is a free variable, so the program isn't closed and is rejected",
      "double is used before it is defined",
      "addInteger needs a force",
      "A program's body can't be an application",
    ],
    explain:
      "[ (lam double body) value ] is how \"let double = value in body\" is spelled in UPLC, so the use of double is fine. The problem is m, which is bound nowhere. Programs must be closed; conversion to de Bruijn indices fails on the free name.",
    fix: `(program 1.1.0
  [ (lam double
      [ double (con integer 21) ])
    (lam n
      [ (builtin addInteger) n n ]) ])`,
  },
  {
    id: "too-many-forces",
    title: "One force too many",
    difficulty: "medium",
    context: "Returns the first element of a list.",
    code: `(program 1.1.0
  (lam xs
    [ (force (force (builtin headList))) xs ]))`,
    options: [
      "headList has one type variable, so it takes exactly one force. The second force fails",
      "headList needs no force because lists already carry their element type",
      "xs must be wrapped in (delay ...) because lists are lazy",
      "headList returns the tail, not the first element",
    ],
    explain:
      "headList : ∀a. list a → a. One ∀, one force; forcing a builtin with no type arguments left is an error. Force counts worth memorising: ifThenElse, trace, headList, tailList, nullList, mkCons, chooseUnit and chooseData take 1; fstPair, sndPair and chooseList take 2.",
    fix: `(program 1.1.0
  (lam xs
    [ (force (builtin headList)) xs ]))`,
  },
  {
    id: "fstpair-one-force",
    title: "Pair projection",
    difficulty: "medium",
    context: "Takes the first component of a pair, for example the key of a map entry.",
    code: `(program 1.1.0
  (lam entry
    [ (force (builtin fstPair)) entry ]))`,
    options: [
      "fstPair has two type variables (one per component), so it needs two forces",
      "fstPair only works on pairs of integers",
      "Pairs can't be passed as lambda arguments",
      "entry has to be forced before it is projected",
    ],
    explain:
      "fstPair : ∀a b. pair a b → a. Two type variables means two forces. With only one, the builtin is still waiting for a type argument when it receives a term, which is an evaluation failure.",
    fix: `(program 1.1.0
  (lam entry
    [ (force (force (builtin fstPair))) entry ]))`,
  },
  {
    id: "string-not-bytes",
    title: "Wrong kind of constant",
    difficulty: "easy",
    context: "Checks that the signer's key hash matches a hard-coded key hash.",
    code: `(program 1.1.0
  (lam signerPkh
    [ (builtin equalsByteString)
      signerPkh
      (con string "a1b2c3") ]))`,
    options: [
      "The hash is a string constant, and equalsByteString fails when given a string. It should be (con bytestring #a1b2c3)",
      "equalsByteString needs a force",
      "Bytestrings have to be converted to integers and compared with equalsInteger",
      "A lam parameter can't hold a bytestring",
    ],
    explain:
      "Builtins check the runtime type of each constant they receive. (con string \"a1b2c3\") is six characters of text, not three bytes. Bytestring literals are written #hex.",
    fix: `(program 1.1.0
  (lam signerPkh
    [ (builtin equalsByteString)
      signerPkh
      (con bytestring #a1b2c3) ]))`,
  },
  {
    id: "v2-returns-false",
    title: "False is not failure",
    difficulty: "medium",
    context: "PlutusV2 spending validator. It should only succeed when the redeemer is 42.",
    code: `-- PlutusV2: datum, redeemer, context
(program 1.0.0
  (lam datum
    (lam redeemer
      (lam ctx
        [ (force (builtin ifThenElse))
          [ (builtin equalsInteger)
            [ (builtin unIData) redeemer ]
            (con integer 42) ]
          (con bool True)
          (con bool False) ]))))`,
    options: [
      "In V1/V2 only an error counts as failure. Returning (con bool False) still succeeds, so anyone can spend",
      "V2 validators take a single argument, the ScriptContext",
      "unIData can't be applied to a redeemer",
      "ifThenElse can only return unit",
    ],
    explain:
      "A PlutusV1/V2 validator fails only if evaluation hits (error) or runs out of budget; the return value is thrown away. Compilers like Aiken and Plinth add a final check that calls error on False. Hand-written UPLC has to do that itself. This is a real, recurring class of exploit.",
    fix: `-- PlutusV2: datum, redeemer, context
(program 1.0.0
  (lam datum
    (lam redeemer
      (lam ctx
        (force
          [ (force (builtin ifThenElse))
            [ (builtin equalsInteger)
              [ (builtin unIData) redeemer ]
              (con integer 42) ]
            (delay (con unit ()))
            (delay (error)) ])))))`,
  },
  {
    id: "v3-returns-bool",
    title: "V3 wants unit",
    difficulty: "medium",
    context: "PlutusV3 script. Succeeds when the isValid helper accepts the context, fails otherwise.",
    code: `-- PlutusV3: a single argument, the ScriptContext
(program 1.1.0
  [ (lam isValid
      (lam ctx
        (force
          [ (force (builtin ifThenElse))
            [ isValid ctx ]
            (delay (con bool True))
            (delay (error)) ])))
    (lam c (con bool True)) ])`,
    options: [
      "A PlutusV3 script must evaluate to exactly (con unit ()). Returning (con bool True) makes even valid transactions fail",
      "The branches shouldn't be delayed",
      "V3 scripts take datum, redeemer and context as three separate arguments",
      "force can't be applied to the result of ifThenElse",
    ],
    explain:
      "V3 tightened the V1/V2 rule (CIP-117): a script succeeds only if it evaluates to the unit constant. Any other value, including True, is a failure. The delay/force structure here is right; only the success value is wrong.",
    fix: `-- PlutusV3: a single argument, the ScriptContext
(program 1.1.0
  [ (lam isValid
      (lam ctx
        (force
          [ (force (builtin ifThenElse))
            [ isValid ctx ]
            (delay (con unit ()))
            (delay (error)) ])))
    (lam c (con bool True)) ])`,
  },
  {
    id: "chooselist-strict",
    title: "Eager head",
    difficulty: "hard",
    context: "Returns the first element of the list, or 0 if the list is empty.",
    code: `(program 1.1.0
  (lam xs
    [ (force (force (builtin chooseList)))
      xs
      (con integer 0)
      [ (force (builtin headList)) xs ] ]))`,
    options: [
      "chooseList is strict like ifThenElse: headList xs runs even when xs is empty, so the empty case fails",
      "chooseList takes the non-empty branch first, so the branches are swapped",
      "headList needs two forces",
      "chooseList needs only one force",
    ],
    explain:
      "chooseList : ∀a b. list a → b → b → b, with the empty branch first. The argument order and force count are both correct. But every argument is evaluated before chooseList runs, so headList is called on the empty list. Delay both branches and force the chosen one.",
    fix: `(program 1.1.0
  (lam xs
    (force
      [ (force (force (builtin chooseList)))
        xs
        (delay (con integer 0))
        (delay [ (force (builtin headList)) xs ]) ])))`,
  },
  {
    id: "y-combinator",
    title: "Lazy fixpoint, strict language",
    difficulty: "hard",
    context: "Computes factorial 5 with a fixpoint combinator.",
    code: `(program 1.1.0
  [ [ (lam f
        [ (lam x [ f [ x x ] ])
          (lam x [ f [ x x ] ]) ])
      (lam self
        (lam n
          (force
            [ (force (builtin ifThenElse))
              [ (builtin equalsInteger) n (con integer 0) ]
              (delay (con integer 1))
              (delay [ (builtin multiplyInteger)
                       n
                       [ self [ (builtin subtractInteger) n (con integer 1) ] ] ]) ]))) ]
    (con integer 5) ])`,
    options: [
      "Under call-by-value, [ x x ] is evaluated immediately and unfolds forever, burning the whole budget. It needs the eta-expanded (Z) combinator",
      "Recursion is impossible in UPLC",
      "self must be forced before it is applied",
      "multiplyInteger overflows at 64 bits",
    ],
    explain:
      "This is the Y combinator, which only works under lazy evaluation. In UPLC the argument [ x x ] is evaluated before f is called, which evaluates [ x x ] again, and so on until the budget runs out. Wrapping the self-application in a lambda, (lam v [ x x v ]), delays it until it is actually called. Integers are arbitrary precision, so overflow isn't a concern.",
    fix: `(program 1.1.0
  [ [ (lam f
        [ (lam x [ f (lam v [ x x v ]) ])
          (lam x [ f (lam v [ x x v ]) ]) ])
      (lam self
        (lam n
          (force
            [ (force (builtin ifThenElse))
              [ (builtin equalsInteger) n (con integer 0) ]
              (delay (con integer 1))
              (delay [ (builtin multiplyInteger)
                       n
                       [ self [ (builtin subtractInteger) n (con integer 1) ] ] ]) ]))) ]
    (con integer 5) ])`,
  },
  {
    id: "rem-vs-mod",
    title: "Negative odds",
    difficulty: "hard",
    context: "Returns True when n is odd, for any integer n.",
    code: `(program 1.1.0
  (lam n
    [ (builtin equalsInteger)
      [ (builtin remInteger) n (con integer 2) ]
      (con integer 1) ]))`,
    options: [
      "remInteger truncates toward zero, so remInteger -7 2 is -1 and negative odd numbers come out as even. Use modInteger",
      "remInteger's arguments are reversed",
      "equalsInteger can't compare negative numbers",
      "UPLC integers are unsigned",
    ],
    explain:
      "The sign of remInteger follows the dividend; the sign of modInteger follows the divisor. modInteger -7 2 = 1, remInteger -7 2 = -1. The same split exists between quotientInteger (truncate) and divideInteger (floor).",
    fix: `(program 1.1.0
  (lam n
    [ (builtin equalsInteger)
      [ (builtin modInteger) n (con integer 2) ]
      (con integer 1) ]))`,
  },
  {
    id: "deadline-reversed",
    title: "Backwards deadline",
    difficulty: "medium",
    context: "Refunds are allowed only after the deadline has passed (POSIX milliseconds).",
    code: `(program 1.1.0
  (lam deadline
    (lam now
      [ (builtin lessThanInteger) now deadline ])))`,
    options: [
      "It returns True when now < deadline, i.e. before the deadline. The arguments are reversed",
      "lessThanInteger doesn't exist; only lessThanEqualsInteger does",
      "Times have to be bytestrings",
      "lessThanInteger needs a force",
    ],
    explain:
      "lessThanInteger a b means a < b. \"After the deadline\" is deadline < now. In a real validator, now isn't a single number: it comes from the transaction's validity interval, and for \"after\" you check the interval's lower bound.",
    fix: `(program 1.1.0
  (lam deadline
    (lam now
      [ (builtin lessThanInteger) deadline now ])))`,
  },
  {
    id: "version-too-old",
    title: "Wrong language version",
    difficulty: "easy",
    context: "Uses sums of products: tag 1 applies the second branch to 7, giving 8.",
    code: `(program 1.0.0
  (case (constr 1 (con integer 7))
    (lam x x)
    (lam y [ (builtin addInteger) y (con integer 1) ])))`,
    options: [
      "constr and case were added in UPLC 1.1.0; a 1.0.0 program containing them is rejected",
      "case branches must be delayed",
      "constr tags start at 1, so this picks the first branch",
      "case needs a force",
    ],
    explain:
      "Sums of products (CIP-85) introduced constr and case in UPLC 1.1.0, which is available to PlutusV3 scripts. Tags are 0-based, so tag 1 picks the second branch and applies it to the field 7. Bump the version and it evaluates to 8.",
    fix: `(program 1.1.0
  (case (constr 1 (con integer 7))
    (lam x x)
    (lam y [ (builtin addInteger) y (con integer 1) ])))`,
  },
  {
    id: "case-missing-branch",
    title: "Missing branch",
    difficulty: "medium",
    context: "Colour is Red | Green | Blue, encoded as constr tags 0, 1, 2. Returns the colour's name.",
    code: `(program 1.1.0
  [ (lam colour
      (case colour
        (con string "Red")
        (con string "Green")))
    (constr 2) ])`,
    options: [
      "Blue (tag 2) has no branch, and case fails on a tag with no matching branch",
      "constr tags start at 1, so tag 2 is Green",
      "case branches must be lambdas even when the constructor has no fields",
      "constr needs at least one field",
    ],
    explain:
      "case picks the branch at the tag's index and applies it to the constructor's fields (none here, so the branch is the result). Two branches cover tags 0 and 1 only. Unlike most typed languages, nothing warns you ahead of time; it fails when that tag actually shows up.",
    fix: `(program 1.1.0
  [ (lam colour
      (case colour
        (con string "Red")
        (con string "Green")
        (con string "Blue")))
    (constr 2) ])`,
  },
  {
    id: "wrong-undata",
    title: "Wrong Data constructor",
    difficulty: "easy",
    context: "Reads the amount stored in a datum.",
    code: `(program 1.1.0
  [ (lam datum
      [ (builtin unIData) datum ])
    (con data (B #0badc0de)) ])`,
    options: [
      "The datum is B (a bytestring), but unIData only accepts I, so it fails",
      "unIData needs a force",
      "Data constants can't be written inline",
      "#0badc0de isn't valid hex",
    ],
    explain:
      "Data has five constructors: Constr, Map, List, I and B. Each un*Data builtin checks which one it was given and fails on the rest. If the shape isn't guaranteed, branch on it with chooseData first, or use unBData if a bytestring is what you meant to store.",
    fix: `(program 1.1.0
  [ (lam datum
      [ (builtin unIData) datum ])
    (con data (I 1000000)) ])`,
  },
  {
    id: "shadowed-owner",
    title: "Shadowed owner",
    difficulty: "hard",
    context:
      "A spending check: hash the signer's public key and compare it with the owner key hash from the datum.",
    code: `(program 1.1.0
  (lam owner
    (lam signerKey
      [ (lam owner
          [ (builtin equalsByteString)
            owner
            [ (builtin blake2b_224) signerKey ] ])
        [ (builtin blake2b_224) signerKey ] ])))`,
    options: [
      "The inner lam rebinds owner to the signer's own hash, so the check compares a hash with itself. It is always True and anyone can spend",
      "blake2b_224 produces 32 bytes, so it can never match a key hash",
      "equalsByteString needs a force",
      "signerKey is out of scope inside the inner lambda",
    ],
    explain:
      "An inner binder shadows an outer one with the same name. The \"let\" meant to bind the hash reused the name owner, so the datum's owner is never looked at. blake2b_224 gives 28 bytes, which is exactly a Cardano key hash, and signerKey is still in scope.",
    fix: `(program 1.1.0
  (lam owner
    (lam signerKey
      [ (lam signerHash
          [ (builtin equalsByteString)
            owner
            signerHash ])
        [ (builtin blake2b_224) signerKey ] ])))`,
  },
  {
    id: "delayed-error-fine",
    title: "Trick question",
    difficulty: "medium",
    context: "What goes wrong when this program is evaluated?",
    code: `(program 1.1.0
  [ (lam x (con integer 1))
    (delay (error)) ])`,
    options: [
      "Nothing. The delayed error is never forced, so the result is (con integer 1)",
      "It fails, because arguments are evaluated before the call",
      "It returns (delay (error))",
      "It's rejected by the parser because error can't appear inside delay",
    ],
    explain:
      "The argument is evaluated, but evaluating (delay t) just produces a suspended value without running t. The error only fires if something forces it, and nothing does. This is exactly why delaying branches works.",
    fix: `-- No change needed.
(program 1.1.0
  [ (lam x (con integer 1))
    (delay (error)) ])`,
  },
  {
    id: "last-byte",
    title: "Off by one",
    difficulty: "medium",
    context: "Returns the last byte of a bytestring.",
    code: `(program 1.1.0
  (lam bs
    [ (builtin indexByteString)
      bs
      [ (builtin lengthOfByteString) bs ] ]))`,
    options: [
      "Indexes are 0-based, so index = length is one past the end and fails. Use length - 1 (and decide what the empty case does)",
      "indexByteString takes the index first, then the bytestring",
      "lengthOfByteString returns the length in bits",
      "indexByteString needs a force",
    ],
    explain:
      "A bytestring of length n has valid indexes 0 to n-1; anything outside fails. For an empty bytestring even length - 1 (which is -1) fails, so decide whether that should be an error or a default.",
    fix: `(program 1.1.0
  (lam bs
    [ (builtin indexByteString)
      bs
      [ (builtin subtractInteger)
        [ (builtin lengthOfByteString) bs ]
        (con integer 1) ] ]))`,
  },
  {
    id: "divide-by-zero",
    title: "Empty average",
    difficulty: "easy",
    context: "Average lovelace per output: total / outputs. outputs can be 0.",
    code: `(program 1.1.0
  (lam total
    (lam outputs
      [ (builtin divideInteger) total outputs ])))`,
    options: [
      "Nothing guards outputs = 0, and divideInteger by zero is an evaluation failure",
      "divideInteger rounds up",
      "divideInteger's arguments are reversed",
      "divideInteger needs a force",
    ],
    explain:
      "Division and modulo by zero fail rather than returning a sentinel. Guard with a check on outputs, delaying the division so it only runs in the non-zero branch. (divideInteger rounds toward negative infinity, for the record.)",
    fix: `(program 1.1.0
  (lam total
    (lam outputs
      (force
        [ (force (builtin ifThenElse))
          [ (builtin equalsInteger) outputs (con integer 0) ]
          (delay (con integer 0))
          (delay [ (builtin divideInteger) total outputs ]) ]))))`,
  },
];

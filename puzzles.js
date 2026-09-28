// `name` is shown while answering and must not hint at the bug; `title` names the bug and is shown after answering.
// Each puzzle: the first option is the correct one (options are shuffled at runtime).
// `context` states what the code is *meant* to do; the bug is the gap between that and the code.
const PUZZLES = [
  {
    id: "missing-force",
    name: "Small or big",
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
    name: "Signature gate",
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
    name: "Double it",
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
    name: "First element",
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
    name: "Map key",
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
    name: "Hard-coded key hash",
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
    name: "Magic redeemer",
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
    name: "Context check",
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
    name: "Head or zero",
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
    name: "Factorial",
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
    name: "Is it odd?",
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
    name: "Refund window",
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
    name: "Tagged increment",
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
    name: "Colour names",
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
    name: "Datum amount",
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
    name: "Owner check",
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
    name: "Mystery program",
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
    name: "Last byte",
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
    name: "Average per output",
    title: "Empty average",
    difficulty: "easy",
    context: "Average lovelace per output: total / outputs.",
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
  {
    id: "append-order",
    name: "Reference token name",
    title: "Label on the wrong end",
    difficulty: "medium",
    context: "Builds a CIP-68 reference token name: the (100) label #000643b0 followed by the base name.",
    code: `(program 1.1.0
  (lam baseName
    [ (builtin appendByteString)
      baseName
      (con bytestring #000643b0) ]))`,
    options: [
      "appendByteString a b puts a first, so the label ends up after the base name instead of before it",
      "#000643b0 is the (222) user-token label, not (100)",
      "appendByteString needs a force",
      "Asset names can't be built on chain",
    ],
    explain:
      "appendByteString concatenates in argument order. CIP-68 labels are 4-byte prefixes, so a label in the wrong position produces a name that no wallet or indexer will recognise. #000643b0 really is the (100) reference label; (222) is #000de140.",
    fix: `(program 1.1.0
  (lam baseName
    [ (builtin appendByteString)
      (con bytestring #000643b0)
      baseName ]))`,
  },
  {
    id: "key-hash-length",
    name: "Key hash length",
    title: "28, not 32",
    difficulty: "medium",
    context: "Fails unless pkh is a well-formed payment key hash.",
    code: `(program 1.1.0
  (lam pkh
    (force
      [ (force (builtin ifThenElse))
        [ (builtin equalsInteger)
          [ (builtin lengthOfByteString) pkh ]
          (con integer 32) ]
        (delay (con unit ()))
        (delay (error)) ])))`,
    options: [
      "Cardano key hashes are blake2b_224, which is 28 bytes. Checking for 32 rejects every real key hash",
      "lengthOfByteString counts hex characters, not bytes",
      "equalsInteger needs a force",
      "The branches are in the wrong order",
    ],
    explain:
      "Payment and stake key hashes, and script hashes, are all 28 bytes (blake2b_224). 32 bytes is the size of an Ed25519 public key or a blake2b_256 hash, which is an easy mix-up. lengthOfByteString counts bytes.",
    fix: `(program 1.1.0
  (lam pkh
    (force
      [ (force (builtin ifThenElse))
        [ (builtin equalsInteger)
          [ (builtin lengthOfByteString) pkh ]
          (con integer 28) ]
        (delay (con unit ()))
        (delay (error)) ])))`,
  },
  {
    id: "datum-hash-algo",
    name: "Datum hash check",
    title: "Wrong hash function",
    difficulty: "hard",
    context: "Checks that an output's datum hash matches the expected datum.",
    code: `(program 1.1.0
  (lam expectedDatum
    (lam outputDatumHash
      [ (builtin equalsByteString)
        outputDatumHash
        [ (builtin sha2_256)
          [ (builtin serialiseData) expectedDatum ] ] ])))`,
    options: [
      "Cardano datum hashes are blake2b_256 of the datum's CBOR, not SHA-256, so this never matches",
      "serialiseData needs a force",
      "Data can't be serialised on chain",
      "Hashes have to be compared with equalsData",
    ],
    explain:
      "The ledger hashes datums with blake2b_256. Both functions give 32 bytes, so nothing fails loudly; the comparison is just always False. Even with the right hash there's a trap: serialiseData produces one canonical CBOR encoding, and a datum attached with a different valid encoding hashes differently. Comparing the Data values directly avoids that.",
    fix: `(program 1.1.0
  (lam expectedDatum
    (lam outputDatumHash
      [ (builtin equalsByteString)
        outputDatumHash
        [ (builtin blake2b_256)
          [ (builtin serialiseData) expectedDatum ] ] ])))`,
  },
  {
    id: "missing-unidata",
    name: "Redeemer equals five",
    title: "Data is not an integer",
    difficulty: "easy",
    context: "Succeeds only when the redeemer (a Data value) is the integer 5.",
    code: `(program 1.1.0
  (lam redeemer
    (force
      [ (force (builtin ifThenElse))
        [ (builtin equalsInteger) redeemer (con integer 5) ]
        (delay (con unit ()))
        (delay (error)) ])))`,
    options: [
      "The redeemer is Data, not an integer, so equalsInteger fails on it. Unwrap it with unIData first",
      "equalsInteger needs a force",
      "The branches shouldn't be delayed",
      "A redeemer can't be compared with a constant",
    ],
    explain:
      "Redeemers and datums arrive as Data. (con data (I 5)) and (con integer 5) are different kinds of constant, and integer builtins reject Data. Either unwrap with unIData, or compare against (con data (I 5)) with equalsData.",
    fix: `(program 1.1.0
  (lam redeemer
    (force
      [ (force (builtin ifThenElse))
        [ (builtin equalsInteger)
          [ (builtin unIData) redeemer ]
          (con integer 5) ]
        (delay (con unit ()))
        (delay (error)) ])))`,
  },
  {
    id: "mkcons-type",
    name: "Prepend owner",
    title: "List of the wrong type",
    difficulty: "medium",
    context: "Starts an owners list containing newOwner, a bytestring key hash.",
    code: `(program 1.1.0
  (lam newOwner
    [ (force (builtin mkCons))
      newOwner
      (con (list integer) []) ]))`,
    options: [
      "The empty list is a list of integers, and mkCons fails when the new element's type doesn't match the list's",
      "mkCons needs two forces",
      "mkCons takes the list first and the element second",
      "Empty list constants aren't allowed",
    ],
    explain:
      "Builtin lists are homogeneous and every list constant carries its element type, even an empty one. mkCons checks that the element matches. Its argument order (element, then list) and single force are both right here.",
    fix: `(program 1.1.0
  (lam newOwner
    [ (force (builtin mkCons))
      newOwner
      (con (list bytestring) []) ]))`,
  },
  {
    id: "trace-partial",
    name: "Traced success",
    title: "Half-applied trace",
    difficulty: "hard",
    context: 'PlutusV3 script: logs "ok" and succeeds.',
    code: `(program 1.1.0
  (lam ctx
    [ (force (builtin trace)) (con string "ok") ]))`,
    options: [
      "trace takes a message and a value to return. With only the message, the result is a partially applied builtin, not unit, so the script fails",
      "trace needs no force",
      "Trace messages must be bytestrings",
      "ctx is unused, so the script is rejected",
    ],
    explain:
      "trace : ∀a. string → a → a. A builtin applied to fewer arguments than it needs is a perfectly good value, and nothing complains until the end, when V3 finds something other than (con unit ()). Unused arguments are fine.",
    fix: `(program 1.1.0
  (lam ctx
    [ (force (builtin trace)) (con string "ok") (con unit ()) ]))`,
  },
  {
    id: "choosedata-order",
    name: "Integer datum?",
    title: "chooseData branch order",
    difficulty: "hard",
    context: "Returns 1 if the datum is an integer (I), otherwise 0.",
    code: `(program 1.1.0
  (lam d
    [ (force (builtin chooseData))
      d
      (con integer 1)
      (con integer 0)
      (con integer 0)
      (con integer 0)
      (con integer 0) ]))`,
    options: [
      "chooseData's branches go Constr, Map, List, I, B. This returns 1 for Constr and 0 for I",
      "chooseData needs two forces",
      "chooseData only takes two branches",
      "The branches must be delayed or it fails",
    ],
    explain:
      "chooseData : ∀a. data → a → a → a → a → a → a, with branches in constructor order: Constr, Map, List, I, B. One force is correct, and since every branch is a plain constant, strictness does no harm here.",
    fix: `(program 1.1.0
  (lam d
    [ (force (builtin chooseData))
      d
      (con integer 0)
      (con integer 0)
      (con integer 0)
      (con integer 1)
      (con integer 0) ]))`,
  },
  {
    id: "swapped-branches",
    name: "Admin only",
    title: "Swapped branches",
    difficulty: "easy",
    context: "Fails unless the transaction is signed by the admin.",
    code: `(program 1.1.0
  (lam adminSigned
    (force
      [ (force (builtin ifThenElse))
        adminSigned
        (delay (error))
        (delay (con unit ())) ])))`,
    options: [
      "The branches are swapped: it fails when the admin signs and succeeds when they don't",
      "ifThenElse needs two forces",
      "adminSigned has to be forced before use",
      "The outer force should be removed",
    ],
    explain:
      "ifThenElse takes the True branch first. The delay/force structure is right, which makes this the dangerous kind of bug: it runs cleanly and is wrong for every input.",
    fix: `(program 1.1.0
  (lam adminSigned
    (force
      [ (force (builtin ifThenElse))
        adminSigned
        (delay (con unit ()))
        (delay (error)) ])))`,
  },
  {
    id: "fence-post",
    name: "Minimum deposit",
    title: "Strict where it should be inclusive",
    difficulty: "medium",
    context: "Accepts deposits of at least 2 ADA (2,000,000 lovelace).",
    code: `(program 1.1.0
  (lam lovelace
    [ (builtin lessThanInteger) (con integer 2000000) lovelace ]))`,
    options: [
      "This is 2000000 < lovelace, so a deposit of exactly 2 ADA is rejected. Use lessThanEqualsInteger",
      "2 ADA is 2,000 lovelace",
      "The arguments are reversed",
      "lessThanInteger needs a force",
    ],
    explain:
      "\"At least\" is ≤. The argument order is right (minimum on the left), and 1 ADA is 1,000,000 lovelace, so the amount is right too. Only the strictness is off, and only for the one boundary value, which is exactly the case tests tend to miss.",
    fix: `(program 1.1.0
  (lam lovelace
    [ (builtin lessThanEqualsInteger) (con integer 2000000) lovelace ]))`,
  },
  {
    id: "ada-units",
    name: "Collateral floor",
    title: "ADA vs lovelace",
    difficulty: "easy",
    context: "Requires at least 5 ADA of collateral.",
    code: `(program 1.1.0
  (lam lovelace
    [ (builtin lessThanEqualsInteger) (con integer 5) lovelace ]))`,
    options: [
      "On-chain amounts are in lovelace (1 ADA = 1,000,000), so this accepts 5 lovelace. It should be 5000000",
      "lessThanEqualsInteger doesn't exist",
      "The comparison is reversed",
      "Integer constants can't be compared with variables",
    ],
    explain:
      "The ledger counts lovelace, never ADA. The comparison direction is right: 5000000 ≤ lovelace means \"at least 5 ADA\".",
    fix: `(program 1.1.0
  (lam lovelace
    [ (builtin lessThanEqualsInteger) (con integer 5000000) lovelace ]))`,
  },
  {
    id: "unconstr-pair",
    name: "First field",
    title: "unConstrData returns a pair",
    difficulty: "hard",
    context: "Reads the first field of a constructor datum such as Constr 0 [owner, deadline].",
    code: `(program 1.1.0
  (lam d
    [ (force (builtin headList))
      [ (builtin unConstrData) d ] ]))`,
    options: [
      "unConstrData returns a pair (tag, fields), not the field list. Take sndPair first, then headList",
      "unConstrData needs a force",
      "headList needs two forces",
      "Constructor fields are stored as a Map",
    ],
    explain:
      "unConstrData : data → pair integer (list data). The tag is usually worth checking too, since it tells you which constructor you actually got. headList on a pair is a type mismatch and fails.",
    fix: `(program 1.1.0
  (lam d
    [ (force (builtin headList))
      [ (force (force (builtin sndPair)))
        [ (builtin unConstrData) d ] ] ]))`,
  },
  {
    id: "map-vs-list",
    name: "Empty map?",
    title: "Map is not List",
    difficulty: "medium",
    context: "Returns True if the datum, which is always a Map, has no entries.",
    code: `(program 1.1.0
  (lam d
    [ (force (builtin nullList))
      [ (builtin unListData) d ] ]))`,
    options: [
      "The datum is a Map, and unListData only accepts List. Use unMapData, which gives a list of pairs",
      "nullList needs two forces",
      "nullList returns an integer, not a bool",
      "An empty Map can't be represented as Data",
    ],
    explain:
      "Map and List are separate Data constructors, even though a Map is \"a list of pairs\" underneath. unMapData returns list (pair data data), and nullList works on that just as well.",
    fix: `(program 1.1.0
  (lam d
    [ (force (builtin nullList))
      [ (builtin unMapData) d ] ]))`,
  },
  {
    id: "case-fields-fine",
    name: "Pair sum",
    title: "Nothing wrong",
    difficulty: "medium",
    context: "What goes wrong when this program is evaluated?",
    code: `(program 1.1.0
  (case (constr 0 (con integer 3) (con integer 4))
    (lam a (lam b [ (builtin addInteger) a b ]))))`,
    options: [
      "Nothing. case applies the only branch to both fields, giving (con integer 7)",
      "A case with a single branch is rejected",
      "The branch has to take one argument holding both fields",
      "constr needs a type annotation",
    ],
    explain:
      "case with tag 0 picks the first (and only) branch and applies it to the fields in order, so a = 3 and b = 4. Single-constructor types, like records and tuples, always look like this.",
    fix: `-- No change needed.
(program 1.1.0
  (case (constr 0 (con integer 3) (con integer 4))
    (lam a (lam b [ (builtin addInteger) a b ]))))`,
  },
  {
    id: "missing-outer-force",
    name: "Quorum gate",
    title: "Branch never forced",
    difficulty: "medium",
    context: "PlutusV3 script: succeeds when hasQuorum accepts the context, fails otherwise.",
    code: `(program 1.1.0
  [ (lam hasQuorum
      (lam ctx
        [ (force (builtin ifThenElse))
          [ hasQuorum ctx ]
          (delay (con unit ()))
          (delay (error)) ]))
    (lam c (con bool True)) ])`,
    options: [
      "The chosen branch is never forced, so the script returns a delayed term instead of unit. It always fails, and the error branch can never fire",
      "The branches shouldn't be delayed",
      "ifThenElse needs two forces",
      "hasQuorum has to be forced before it is applied",
    ],
    explain:
      "Delaying the branches is only half of the pattern; the value ifThenElse returns has to be forced. Without that, the result is (delay (con unit ())), which isn't unit, so V3 rejects it every time. Under V1/V2 the same mistake would do the opposite: nothing ever errors, so every transaction passes.",
    fix: `(program 1.1.0
  [ (lam hasQuorum
      (lam ctx
        (force
          [ (force (builtin ifThenElse))
            [ hasQuorum ctx ]
            (delay (con unit ()))
            (delay (error)) ])))
    (lam c (con bool True)) ])`,
  },
  {
    id: "trace-order",
    name: "Log and return",
    title: "trace arguments reversed",
    difficulty: "easy",
    context: 'Logs "done" and returns unit.',
    code: `(program 1.1.0
  [ (force (builtin trace))
    (con unit ())
    (con string "done") ])`,
    options: [
      "trace takes the message first and the returned value second. Here unit is passed as the message, so it fails",
      "trace needs two forces",
      "trace can only return strings",
      "String constants have to be written as bytestrings",
    ],
    explain:
      "trace : ∀a. string → a → a. The message must be a string; the second argument can be anything and is what trace returns.",
    fix: `(program 1.1.0
  [ (force (builtin trace))
    (con string "done")
    (con unit ()) ])`,
  },
  {
    id: "exact-threshold",
    name: "Two of three",
    title: "Exactly, not at least",
    difficulty: "medium",
    context: "Multisig: succeeds when at least 2 of 3 keys signed. signatures is the number of valid signatures.",
    code: `(program 1.1.0
  (lam signatures
    (force
      [ (force (builtin ifThenElse))
        [ (builtin equalsInteger) signatures (con integer 2) ]
        (delay (con unit ()))
        (delay (error)) ])))`,
    options: [
      "It requires exactly 2 signatures, so a transaction signed by all 3 keys is rejected. Check 2 ≤ signatures instead",
      "equalsInteger needs a force",
      "The count should be compared as a bytestring",
      "The branches are swapped",
    ],
    explain:
      "An equality check where the spec says \"at least\" works for the case everyone tests (the minimum) and fails for the more trusted case (everyone signs). lessThanEqualsInteger 2 signatures is 2 ≤ signatures.",
    fix: `(program 1.1.0
  (lam signatures
    (force
      [ (force (builtin ifThenElse))
        [ (builtin lessThanEqualsInteger) (con integer 2) signatures ]
        (delay (con unit ()))
        (delay (error)) ])))`,
  },
  {
    id: "int-as-bool",
    name: "Feature flag",
    title: "An integer is not a bool",
    difficulty: "easy",
    context: 'flag is 1 when the feature is on and 0 when it is off. Returns "on" or "off".',
    code: `(program 1.1.0
  (lam flag
    [ (force (builtin ifThenElse))
      flag
      (con string "on")
      (con string "off") ]))`,
    options: [
      "ifThenElse needs a bool, and flag is an integer, so it fails. Compare it first with equalsInteger flag 1",
      "ifThenElse needs two forces",
      "The branches must be delayed",
      "ifThenElse can't return strings",
    ],
    explain:
      "UPLC has no truthiness: the condition must be a (con bool ...) value. The branches are plain constants, so leaving them undelayed is fine.",
    fix: `(program 1.1.0
  (lam flag
    [ (force (builtin ifThenElse))
      [ (builtin equalsInteger) flag (con integer 1) ]
      (con string "on")
      (con string "off") ]))`,
  },
  {
    id: "key-vs-hash",
    name: "Signer match",
    title: "Key compared with a hash",
    difficulty: "medium",
    context: "Checks that signerKey (a 32-byte Ed25519 public key) belongs to owner (a payment key hash from the datum).",
    code: `(program 1.1.0
  (lam owner
    (lam signerKey
      [ (builtin equalsByteString) owner signerKey ])))`,
    options: [
      "owner is a 28-byte hash and signerKey is a 32-byte key, so they can never be equal. Hash the key with blake2b_224 first",
      "Public keys can only be compared with verifyEd25519Signature",
      "equalsByteString needs a force",
      "The arguments are in the wrong order",
    ],
    explain:
      "Datums and addresses store key hashes, not keys. equalsByteString happily compares bytestrings of different lengths and returns False, so this fails closed: nobody, including the owner, can spend.",
    fix: `(program 1.1.0
  (lam owner
    (lam signerKey
      [ (builtin equalsByteString)
        owner
        [ (builtin blake2b_224) signerKey ] ])))`,
  },
];

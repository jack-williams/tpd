# TPD (The Prime Directive)

*The Prime Directive* is tool for generating contracts for JavaScript
 libraries from their TypeScript definition files.

We use TPD to evaluate the correctness of definition files in
[DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped),
in addition to the impact of using JavaScript proxies to implement
contracts. Our results can be found in the paper [Mixed Messages:
Measuring Conformance and Non-Interference in
TypeScript](http://drops.dagstuhl.de/opus/volltexte/2017/7264/pdf/LIPIcs-ECOOP-2017-28.pdf).

If you are interested in this work we recommend looking at the
following:

- The [complete software
artifact](http://drops.dagstuhl.de/opus/volltexte/2017/7289/) for TPD
that includes this code as well as all the JavaScript libraries to
reproduce our results.

- Our latest contract library
  [`contracts-ts`](https://github.com/jack-williams/contracts-ts),
  based on an upcoming paper on intersection and union contracts.

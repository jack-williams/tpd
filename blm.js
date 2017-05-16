#! /usr/bin/env node
var program = require('commander');
var fs = require('fs');
var path = require('path');
var beautify = require('js-beautify').js_beautify;
var wrapgen = require('./build/wrap-gen.js');


var blameSource = __dirname + '/build/blame.js'

program
    .version('0.0.1')
    .option('-v, --verbose', 'Print the log')
    .option('-N, --node', 'Node wrapper')
    .option('-L, --lib', "Include TypeScript\'s lib.d.ts file");

program
    .command('*')
    .description('print type declaration for .d.ts files')
program.parse(process.argv);

if (program.args.length < 1) {
    program.help()
}

var inputs = program.args.map(function(file) {
    return {
        file: file,
        text: fs.readFileSync(file, 'utf8')
    }
})
if (program.lib) {
    inputs.unshift({
        file: ">lib.d.ts",
        text: fs.readFileSync('lib/tscheck/lib/lib.d.ts', 'utf8')
    })
}


var parser = new wrapgen.WrapperGenerator(!!program.node);
var declarations = ';(function(){ var Blame = require(\'' + blameSource + '\'), ' + 
    'T = new Blame.LazyTypeCache(), M = Object.create(null);' +
    parser.compile(inputs) +
    '\nT.verify(); }());';

console.log('// ------------------------');
console.log('// node: %j', !!program.node);
console.log(beautify(declarations, { indent_size: 2 }));



// vim: set ts=2 sw=2 sts=2 et :

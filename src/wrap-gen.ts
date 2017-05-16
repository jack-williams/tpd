///<reference path="../lib/node.d.ts" />

var BLAME_MODULE:string = "Blame";
var tscore = require("../lib/tscheck/tscore.js");
var fs = require("fs");

class TypeCache {

  private declarations: string[];
  private symbols: {[id: string]: boolean};
  private types: {[id: string]: boolean};
  private modules: {[id: string]: boolean};
  private genericTypeParams: {[id: string]: Array<Object>};
  private classes: {[id: string]: boolean};
  public emptyModules: {[id: string]: boolean};
  private node: boolean;

  constructor(node?: boolean) {
    this.declarations = [];
    this.symbols = Object.create(null);
    this.types = Object.create(null);
    this.modules = Object.create(null);
    this.genericTypeParams = Object.create(null);
    this.classes = Object.create(null);
    this.emptyModules = Object.create(null);
    this.node = !!node;
  }

  public addGlobalDeclaration(identifier: string, type: string): void {
    if(type === undefined) { return; }
    var declaration: string = identifier + " = " + BLAME_MODULE + ".simple_wrap(" + identifier + ", " + type + ");";
    if (!this.node) {
      // Because those symbols might not be visible
      this.declarations.push(declaration);
    }
    this.symbols[identifier] = true;
  }

  public addTypeDeclaration(name: string, type: string): void {
    if (!this.isTypeDeclared(name)) {
      var declaration: string = "T.set('" + name + "', " + type + ");";
      this.declarations.push(declaration);
      this.types[name] = true;
    }
  }

  public addModuleDeclaration(name: string, type: string): void {
    var declaration: string;
    if (this.node) {
      declaration = "module.exports = exports = "
        + BLAME_MODULE + ".simple_wrap(module.exports, " + type + ");";
    } else {
      declaration = "M[" + name + "] = " + type + ";";
    }

    this.declarations.push(declaration);
    this.modules[name] = true;
  }

  public addGenericTypeParams(name: string, typeArgs: Array<Object>) {
    this.genericTypeParams[name] = typeArgs;
  }

  public addClass(name: string) {
    this.classes[name] = true;
  }
  
  public getGenericTypeParams(name: string): Array<Object> {
    return this.genericTypeParams[name];
  }

  public isClass(identifier: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.classes, identifier);
  }
  
  public generateDeclarations(): string {
    return this.declarations.join("\n");
  }

  public isDeclared(identifier: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.symbols, identifier);
  }

  public isTypeDeclared(name: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.types, name);
  }

  public isModuleDeclared(name: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.modules, name);
  }
}

export class WrapperGenerator {

  private currentlyParsing: {[id: string]: boolean}; 
  private tc: TypeCache;
  private typeEnv;
  private node: boolean;
  private mainFiles: string[];

  
  constructor(node?: boolean) {
    this.tc = new TypeCache(!!node);
    this.mainFiles = [];
    this.currentlyParsing = Object.create(null);
  }

  private addMainFiles(inputs: any): void {
    for(var i in inputs) {
      this.mainFiles.push(inputs[i].file);
    }
  }
  
  public compile(inputs: any): string {
    this.addMainFiles(inputs);
    var output = this.parseGlobalTypeDef(tscore(inputs));
    this.tc = new TypeCache(this.node);
    this.currentlyParsing = Object.create(null);
    this.mainFiles = [];
    return output;
  }
    
  public compileFromString(input: string): string {
    var inputs = [{
      file: 'fromString.d.ts',
      text: input
    }];
    this.addMainFiles(inputs);
    var output = this.parseGlobalTypeDef(tscore(inputs));
    this.tc = new TypeCache(this.node);
    this.currentlyParsing = Object.create(null);
    this.mainFiles = [];
    return output;
  }
  
  public parseGlobalTypeDef(def: any): string {
    this.typeEnv = def.env;
    for(var t in def.env) {
      if(t !== def.global) {
        if(!this.tc.isTypeDeclared(t)) {
          if(def.env[t].object.meta.origin === ">lib.d.ts") {
            continue;
          }
          this.parseTypeDef(
            t,def.env[t],
            {name: t.replace("external_module:","").replace("module:","")});
        }
      }
    }
    
    var globalType:any = def.env[def.global];

    for (var t in globalType.object.properties) {
      if(globalType.object.properties[t].meta.origin === ">lib.d.ts") {
        continue;
      }

      if(this.mainFiles.indexOf(globalType.object.properties[t].meta.origin) < 0) {
        continue;
      }

      var typeS:string =
        this.parseType(globalType.object.properties[t].type,
                       {name: t.replace("external_module:","").replace("module:","")});
      if(typeS === null) { continue; }

      if(def.externs[t] === undefined) {
        if((t[0] === "'" || t[0] === '"') &&
           (t[t.length - 1] === "'" || t[t.length - 1] === '"')) {
          var cleanedName = t.substring(1,t.length - 1);
          if(def.externs[cleanedName]) {
            continue;
          }
          this.tc.addModuleDeclaration(t,typeS);
        } else {
          this.tc.addGlobalDeclaration(t,typeS);
        }
      }      
    }

    for(var t in def.externs) {
      if(this.mainFiles.indexOf(def.externs[t].meta.origin) < 0) {
        continue;
      }
      this.tc.addModuleDeclaration(
        t,
        this.parseType(
          def.externs[t],
          {name: t.replace("external_module:","").
           replace("module:","")}));
    }
    return this.tc.generateDeclarations();
  }

  private parseTypeDef(name: string, def: any, context?: {name: string}): void {

    if(this.currentlyParsing[name]) { return; }
    else { this.currentlyParsing[name] = true; }
    
    if(def.object.brand) {
      this.tc.addClass(def.object.brand);
    }
    
    if(def.typeParameters.length > 0) {
      // Do this first an we may have a recursive type that needs to
      // know the args.
      this.tc.addGenericTypeParams(name, def.typeParameters);
    }
    
    var body:string = this.parseObjectType(def.object, context);

    if(body === (BLAME_MODULE + ".obj({})") && def.object.meta.kind === "module") {
      this.tc.emptyModules[name] = true
      return;
    }

    this.tc.addTypeDeclaration(name,body);

    delete this.currentlyParsing[name];

  }

  private parseObjectType(body: any, context?: {name: string}): string {
    switch(body.meta.kind) {
    case "module":
      var m:string = this.parseInterfaceKind(body, context);
      if(body.meta.isEnum) {
        m = BLAME_MODULE + ".hybrid(" + BLAME_MODULE + ".arr(Blame.Str), " + m + ")";
      }
      return m;
    case "class":
      return this.parseInterfaceKind(body, context);
    case "interface":
      return this.parseInterfaceKind(body, context);
    default:
      throw new Error("Unexpected object kind: " + body.meta.kind);
    }
  }

  private parseInterfaceKind(body: any, context?: {name: string}): string {
    
    var props:string[] = [];
    var funs:string[] = [];
    var members:string[] = [];
    
    if(body.numberIndexer !== null) {
      members.push(BLAME_MODULE + ".arr(" + this.parseType(body.numberIndexer, context) + ")");
    }

    if(body.stringIndexer !== null) {
      members.push(BLAME_MODULE + ".dict(" + this.parseType(body.stringIndexer, context) + ")");
    }
    
    // Handle Properties
    for(var prop in body.properties) {
      var p = this.parseProperty(prop, body.properties[prop], context)
      if(p) {
        props.push(p);
      }
    }

    for(var i in body.calls) { // calls are an array
      funs.push(this.parseFunctionSig(body.calls[i]));
    }

    if (props.length > 0) {
      members.push(BLAME_MODULE + ".obj({" + props.join(", ") + "})");
    }
    
    if(funs.length > 0) {
      members.push(funs.length > 1 ?
                   BLAME_MODULE + ".hybrid(" + funs.join(", ") + ")" :
                   funs[0]);
    }

    if(members.length == 0) return BLAME_MODULE + ".obj({})";
    
    return members.length > 1 ?
      BLAME_MODULE + ".hybrid(" + members.join(", ") + ")" : members[0];
  }

  private parseProperty(name: any, prop: any, context?: {name: string}): string {
    context = context ? {name : context.name + "." + name } : {name: name};
    var typeStr:string = this.parseType(prop.type, context);

    if(typeStr === null) { return null; }

    if(prop.optional) {
      typeStr = BLAME_MODULE + ".union(" + typeStr + ", " + BLAME_MODULE + ".Null)";
    }
    return name + ": " + typeStr;
  }

  private parseFunctionSig(f: any): string {

    var dom:string[] = [];
    var optional:string[] = [];
    var rest:string = "null";
    var ret:string = this.parseType(f.returnType);
    var output:string = "";

    if(f.variadic) {
      rest = this.parseType(f.parameters.pop().type);
    }
    
    for(var p in f.parameters) {
      var t:string = this.parseType(f.parameters[p].type);
      if(f.parameters[p].optional) {
        optional.push(t);
      } else {
        dom.push(t);
      }
    }

    if(f.new) {
      output = BLAME_MODULE + ".fun([" + dom.join(", ") + "], " +
        "[" + optional.join(", ") + "], " +
        rest + ", " +
        BLAME_MODULE + ".Any, " +
        ret + ")";
    } else {
      output = BLAME_MODULE + ".fun([" + dom.join(", ") + "], " +
        "[" + optional.join(", ") + "], " +
        rest + ", " +
        ret + ")";
    }
    
    if(f.typeParameters.length > 0) {
      output = f.typeParameters.reduce((output, tyvar) => {
        return BLAME_MODULE + ".forall('" + tyvar.name + "', " + output + ")";
      }, output);
    }
    return output;
  }

  private parseType(t: any, context?: {name: string}): string {

    switch(t.type) {
    case "object":
      return this.parseObjectType(t, context);
    case "enum":
      return BLAME_MODULE + ".Num"; 
    case "string-const":
      return BLAME_MODULE + ".Str"; 
    case "type-param":
      return this.parseTypeParam(t);
    case "reference":
      return this.parseReferenceType(t);
    default:
      return this.parseBuiltInType(t);
    }
  }

  private parseTypeParam(t: any): string {
    return BLAME_MODULE + ".tyvar('" + t.name + "')";
  }

  private parseReferenceType(t: any): string {

    if(Object.prototype.hasOwnProperty.call(this.tc.emptyModules, t.name)) {
      return null;
    }

    // Arrays are a special type of reference.
    if(t.name === "Array") {
      if(t.typeArguments.length === 1) {
        return BLAME_MODULE + ".arr(" + this.parseType(t.typeArguments[0]) + ")";
      }
      return BLAME_MODULE + ".arr(" + BLAME_MODULE + ".Any)";
    }

    if(!this.tc.isTypeDeclared(t.name)) {
      var def = this.typeEnv[t.name];
      if(def) {
        this.parseTypeDef(t.name,this.typeEnv[t.name]);
      } else {
        throw new Error("Cannot find defintion for type " + t.name);
      }
    }
    
    if(t.typeArguments.length > 0) {
      var typeParams = this.tc.getGenericTypeParams(t.name);
      var substType:string = "T.get('"+ t.name +"')";
      if(!typeParams) {
        this.parseTypeDef(t.name,this.typeEnv[t.name]);
        typeParams = this.tc.getGenericTypeParams(t.name);
      }
      substType = t.typeArguments.reduce((substType, ty, i) => {
        return BLAME_MODULE +
          ".substitute_tyvar(" +
          substType + ", '" + typeParams[i] + "', " + this.parseType(ty) + ")";
      } , substType);
      return substType;
    }
    return "T.get('"+ t.name +"')";
  }

  private parseBuiltInType(t: any): string {
    switch(t.type) {
    case "number": return BLAME_MODULE + ".Num";
    case "string": return BLAME_MODULE + ".Str";
    case "boolean": return BLAME_MODULE + ".Bool";
    case "void": return BLAME_MODULE + ".Void";
    case "any": return BLAME_MODULE + ".Any";
    default:
      throw new Error("Can't match built in type: " + t);
    }
  }
}

function main() {
  var program = require('commander');
  program.usage('FILE.d.ts... [options]');
  program.commandHelp = function() { return "  Convert *.d.ts files to TypeScript Declaration Core\n" }
  program.option('--lib', "Include TypeScript\'s lib.d.ts file").
    option('--node', "Process Wrapper for use with node");
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
  var WG = new WrapperGenerator(program.node);
  console.log(WG.compile(inputs));
}

if (require.main === module) {
  main();
}

///<reference path="../lib/node.d.ts" />

var Reflect = require("harmony-reflect");
type WeakMap<K,V> = any;
declare function WeakMap(): void;
declare function Proxy(target: any, handler: {}): void;

// Load Blame Tracking
import BlameNodes = require("./blame-nodes")
export enum BLAME_ERROR_LEVEL_TYPE {
  SILENT,
  LOG,
  FATAL
}

export var BLAME_ERROR_LEVEL: BLAME_ERROR_LEVEL_TYPE =
  BLAME_ERROR_LEVEL_TYPE.SILENT;

// Counter for blame labels
var count: number = 0;

/* 

Define Types for Wrappers 

*/

export enum TypeKind {
  AnyType,
  BaseType,
  FunctionType,
  ForallType,
  TypeVariable,
  BoundTypeVariable,
  ArrayType,
  DictionaryType,
  ObjectType,
  HybridType,
  LazyType,
  BoundLazyType,
  UnionType
}

export interface IType {
  description: string;
  kind(): TypeKind;
}

export class BaseType implements IType {

  constructor(public description: string, public contract: (any) => boolean) {
  }

  public kind(): TypeKind {
    return TypeKind.BaseType;
  }
}

// Declaring BaseTypes
export var Num = new BaseType("Num", function (value: any): boolean {
  return typeof value === "number";
});

export var Bool = new BaseType("Bool", function (value: any): boolean {
  return typeof value === "boolean";
});

export var Str = new BaseType("Str", function (value: any): boolean {
  return typeof value === "string";
});

export var Void = new BaseType("Void", function (value: any): boolean {
  return typeof value === "undefined";
});

// Private BaseTypes, used by other types
export var Obj = new BaseType("Obj", function (value: any): boolean {
  return typeof value === "object";
});

export var Fun = new BaseType("Fun", function (value: any): boolean {
  return typeof value === "function";
});

export var Null = new BaseType("Null", function (value: any): boolean {
  return typeof value === "undefined" || value === null;
});

var Arr = new BaseType("Arr", function (value: any): boolean {
  return Array.isArray(value);
});

// Declaring Type Any
export var Any: IType = {
  description: "Any",
  kind: function(): TypeKind {
    return TypeKind.AnyType;
  }
};


function description(postfix: string): (IType) => string {
  return function (arg: IType): string {
    var desc = arg.description;
    if ((arg.kind() === TypeKind.FunctionType) ||
        (arg.kind() === TypeKind.ForallType)) {
      desc = "(" + desc + ")";
    }

    return desc + postfix;
  };
}

export class FunctionType implements IType {
  public requiredParameters: IType[];
  public optionalParameters: IType[];
  public restParameter: IType;
  public returnType: IType;
  public constructType: IType;

  public description: string;

  constructor(requiredParameters: IType[],
              optionalParameters: IType[],
              restParameter: IType,
              returnType: IType,
              constructType: IType) {

    this.requiredParameters = requiredParameters || [];
    this.optionalParameters = optionalParameters || [];

    this.restParameter = null;
    if (restParameter) {
      this.restParameter = restParameter;
    }

    this.returnType = returnType || Any;
    this.constructType = constructType || Any;

    var descs: string[] = ([])
      .concat(this.requiredParameters.map(description("")),
              this.optionalParameters.map(description("?")));

    if (this.restParameter) {
      descs.push(description("*")(this.restParameter));
    }

    if (this.requiredParameters.length === 0 &&
        this.optionalParameters.length === 0 &&
        !this.restParameter) {
      descs.push("()");
    }

    descs.push(description("")(this.returnType));

    this.description = descs.join(" -> ");

    if (this.constructType !== Any) {
      this.description += "  C:" + this.constructType.description;
    }
  }

  public kind(): TypeKind {
    return TypeKind.FunctionType;
  }
}

export function fun(range: IType[], optional: IType[], rest: IType, ret: IType, cons: IType): FunctionType {
  return new FunctionType(range, optional, rest, ret, cons);
}

export class ForallType implements IType {

  public type: IType;

  public description: string;

  constructor(public tyvar: string, type: IType) {
    this.type = type;
    this.description = "forall " + this.tyvar + ". " + this.type.description;
  }

  public kind(): TypeKind {
    return TypeKind.ForallType;
  }
}

export function forall(tyvar: any, type: IType) {
  return new ForallType(String(tyvar), type);
}

export class TypeVariable implements IType {

  constructor(public description: string) {
  }

  public kind(): TypeKind {
    return TypeKind.TypeVariable;
  }
}

export function tyvar(id: string): TypeVariable {
  return new TypeVariable(id);
}

class BoundTypeVariable extends TypeVariable {
  private static globalStorage: WeakMap<any, any> = new WeakMap();

  constructor(description: string, storage?: WeakMap<any, any>) {
    super(description);
  }

  public seal(value: any, p: any): any {

    // Create token to store.
    var token = {
      tyvar: this.description,
      v: value
    };

    // Wrap the value in an object so all values can be sealed.
    var sealed = new Proxy({v : value}, {
      get: function (target: any, name: string, receiver: any): any {
        p.seal().blame("Access to sealed parameter not permitted " + name);
        if (name === "v") {
          return value; // Help in debugging.
        }
        if (name === "valueOf") {
          return value.valueOf.bind(value);
        }
        if (name === "toString") {
          return value.toString.bind(value);
        }
        if (name === "hasOwnProperty") {
          return value.hasOwnProperty.bind(value);
        }
        return Reflect.get(value,name)
      },
      set: function (target: any, name: string, val: any, receiver: any): void {
        p.seal().blame("Access to sealed parameter not permitted: " + name);
        return Reflect.set(value,name,val);
      },
      apply: function (target: any, thisValue: any, args: any[]): any {
        p.seal().blame("Applying a sealed parameter not permitted");
        return Reflect.apply(value,thisValue,args);
      }
    });
    BoundTypeVariable.globalStorage.set(sealed, token);
    return sealed;
  }

  public unseal(t: any, p: any): any {
    if(!(typeof t === 'object')) {
      p.flat().blame(t + " is not a sealed token!! (" + this.description + ")");
      return t;
    } else if(!(BoundTypeVariable.globalStorage.has(t))) {
      p.flat().blame(t + " is not a sealed token!! (" + this.description + ")");
      return t;
    }
    var contents = BoundTypeVariable.globalStorage.get(t);
    if(contents.tyvar !== this.description) {
      p.flat().blame("Token: " + contents.v + " sealed by a different forall");
    }
    return contents.v
  }

  public kind(): TypeKind {
    return TypeKind.BoundTypeVariable;
  }
}

export class ArrayType implements IType {
  public description: string;
  public type: IType;

  constructor(type: IType) {
    this.type = type;
    this.description = "[" + this.type.description + "]";
  }

  public kind(): TypeKind {
    return TypeKind.ArrayType;
  }
}

export function arr(type: IType): ArrayType {
  return new ArrayType(type);
}

export class DictionaryType extends ArrayType {
  constructor(type: IType) {
    super(type);
    this.description = "{" + this.type.description + "}";
  }

  public kind(): TypeKind {
    return TypeKind.DictionaryType;
  }
}

export function dict(type: IType): DictionaryType {
  return new DictionaryType(type);
}

export interface TypeDict {
  [id: string]: IType
}

export class ObjectType implements IType {
  public description: string;
  public properties: TypeDict;

  constructor(properties: TypeDict) {
    this.properties = Object.create(null);

    var descs: string[] = [];

    for (var key in properties) {
      if (Object.prototype.hasOwnProperty.call(properties, key)) {
        this.properties[key] = properties[key];
        descs.push(key + ": " + properties[key].description);
      }
    }

    this.description = "{" + descs.join(", ") + "}";
  }

  public kind(): TypeKind {
    return TypeKind.ObjectType;
  }
}

export function obj(properties: TypeDict): ObjectType {
  return new ObjectType(properties);
}

// This is essentially and :P
export class HybridType implements IType {
  public description: string;
  public types: IType[] = [];

  constructor(types: IType[]) {
    this.types = types.map((type) => { return type; });
    this.description = this.types.map((type) => { return type.description; }).join(" && ");
  }

  public kind(): TypeKind {
    return TypeKind.HybridType;
  }
}

export function hybrid(...types: IType[]): HybridType {
  return new HybridType(types);
}

export class LazyTypeCache {
  private typeCache: TypeDict;
  private requested: string[];

  constructor() {
    this.typeCache = Object.create(null);
    this.requested = [];
  }

  public get(name: string): IType {
    var resolver = () => {
      return this.typeCache[name] || Any;
    };

    this.requested.push(name);

    return new LazyType(name, resolver);
  }

  public set(name: string, type: IType): void {
    this.typeCache[name] = type;
  }

  public verify(): boolean {
    return this.requested.every((name) => {
      return Object.prototype.hasOwnProperty.call(this.typeCache, name);
    });
  }
}

export class LazyType {

  constructor(public description: string, public resolver: () => IType) {
  }

  public kind(): TypeKind {
    return TypeKind.LazyType;
  }

  public resolve(): IType {
    return this.resolver();
  }
}

export class BoundLazyType extends LazyType {
  private tys: string[];
  private new_types: IType[];

  constructor(type: LazyType) {
    super(type.description, type.resolver);
    this.tys = [];
    this.new_types = [];
  }

  public add(ty: string, new_type: IType): void {
    this.tys.push(ty);
    this.new_types.push(new_type);
  }

  public resolve(): IType {
    var resolved = this.resolver();

    this.tys.forEach((ty, i) => {
      resolved = substitute_tyvar(resolved, ty, this.new_types[i]);
    });

    return resolved;
  }

  public hasTy(ty: string): boolean {
    return this.tys.some((myTy) => {
      return ty === myTy;
    });
  }
}


export class UnionType implements IType {
  public description: string;
  public types: IType[] = [];

  constructor(types: IType[]) {
    this.types = types.map((type) => { return type; });
    this.description = this.types.map((type) => { return type.description; }).join(" + ");
  }

  public kind(): TypeKind {
    return TypeKind.UnionType;
  }
}

export function union(...types: IType[]): UnionType {
  return new UnionType(types);
}

export function substitute_tyvar(target: IType, ty: string, new_type: IType): IType {
  switch (target.kind()) {
  case TypeKind.AnyType:
  case TypeKind.BaseType:
  case TypeKind.BoundTypeVariable:
    return target;

  case TypeKind.FunctionType:
    return substitute_tyvar_fun(<FunctionType> target, ty, new_type);

  case TypeKind.ForallType:
    return substitute_tyvar_forall(<ForallType> target, ty, new_type);

  case TypeKind.TypeVariable:
    return substitute_tyvar_tyvar(<TypeVariable> target, ty, new_type);

  case TypeKind.ArrayType:
    return substitute_tyvar_arr(<ArrayType> target, ty, new_type);

  case TypeKind.DictionaryType:
    return substitute_tyvar_dict(<DictionaryType> target, ty, new_type);

  case TypeKind.ObjectType:
    return substitute_tyvar_obj(<ObjectType> target, ty, new_type);

  case TypeKind.HybridType:
    return substitute_tyvar_hybrid(<HybridType> target, ty, new_type);

  case TypeKind.LazyType:
    return substitute_tyvar_lazy(<LazyType> target, ty, new_type);

  case TypeKind.BoundLazyType:
    return substitute_tyvar_bound_lazy(<BoundLazyType> target, ty, new_type);

  case TypeKind.UnionType:
    return substitute_tyvar_union(<UnionType> target, ty, new_type);
  default:
    return target;
  }
}

function substitute_tyvar_union(target: UnionType, ty: string, new_type: IType): UnionType {
  function substitute(p: IType) {
    return substitute_tyvar(p, ty, new_type);
  }
  var ntypes: IType[] = target.types.map(substitute);
  return new UnionType(ntypes);
}

function substitute_tyvar_fun(target: FunctionType, ty: string, new_type: IType): FunctionType {
  function substitute(p: IType) {
    return substitute_tyvar(p, ty, new_type);
  }

  var requiredParameters: IType[] = target.requiredParameters.map(substitute);
  var optionalParameters: IType[] = target.optionalParameters.map(substitute);
  var restParameter: IType = null;
  if (target.restParameter) {
    restParameter = substitute(target.restParameter);
  }

  var returnType: IType = substitute(target.returnType);
  var constructType: IType = substitute(target.constructType);

  return new FunctionType(requiredParameters, optionalParameters, restParameter, returnType, constructType);
}

function substitute_tyvar_forall(target: ForallType, ty: string, new_type: IType): ForallType {
  if (target.tyvar === ty) {
    return target;
  }

  return new ForallType(target.tyvar, substitute_tyvar(target.type, ty, new_type));
}

function substitute_tyvar_tyvar(target: TypeVariable, ty: string, new_type: IType): TypeVariable {
  if (target.description === ty) {
    return new_type;
  }

  return target;
}

function substitute_tyvar_arr(target: ArrayType, ty: string, new_type: IType): ArrayType {
  return new ArrayType(substitute_tyvar(target.type, ty, new_type));
}

function substitute_tyvar_dict(target: DictionaryType, ty: string, new_type: IType): DictionaryType {
  return new DictionaryType(substitute_tyvar(target.type, ty, new_type));
}

function substitute_tyvar_obj(target: ObjectType, ty: string, new_type: IType): ObjectType {
  var properties: TypeDict = Object.create(null);

  for (var key in target.properties) {
    if (Object.prototype.hasOwnProperty.call(target.properties, key)) {
      properties[key] = substitute_tyvar(target.properties[key], ty, new_type);
    }
  }

  return new ObjectType(properties);
}

function substitute_tyvar_hybrid(target: HybridType, ty: string, new_type: IType): HybridType {
  var new_types: IType[];
  new_types = target.types.map((type) => { return substitute_tyvar(type, ty, new_type); });

  return new HybridType(new_types);
}

function substitute_tyvar_lazy(target: LazyType, ty: string, new_type: IType): BoundLazyType {
  var blt: BoundLazyType = new BoundLazyType(target);
  blt.add(ty, new_type);

  return blt;
}

function substitute_tyvar_bound_lazy(target: BoundLazyType, ty: string, new_type: IType): IType {
  if (target.hasTy(ty)) {
    return target;
  }
  target.add(ty, new_type);

  return target;
}


function compatible_base(A: BaseType, B: BaseType): boolean {
  return A.description === B.description;
}

function compatible_fun(A: FunctionType, B: FunctionType): boolean {
  return A.requiredParameters.length === B.requiredParameters.length &&
    A.optionalParameters.length === B.optionalParameters.length &&
    (!!A.restParameter) === (!!B.restParameter);
}

function compatible_forall(A: ForallType, B: ForallType): boolean {
  return A.tyvar === B.tyvar;
}

function compatible_obj(A: ObjectType, B: ObjectType): boolean {
  for (var key in A.properties) {
    if (Object.prototype.hasOwnProperty.call(A, key)) {
      if (!Object.prototype.hasOwnProperty.call(B, key)) {
        return false;
      }
    }
  }
  return true;
}

function compatible_hybrid(A: HybridType, B: HybridType): boolean {
  if (A.types.length !== B.types.length) {
    return false;
  }
  return true;
}


function compatible_lazy(A: LazyType, B: LazyType): boolean {
  return A.description === B.description;
}

function compatible_union(A: UnionType, B: UnionType): boolean {
  if (A.types.length !== B.types.length) {
    return false;
  }
  return true;
}

/* 

Define Wrapping Functions 

*/

export function simple_wrap(value: any, A: IType): any {
  var p = new BlameNodes.BaseNode(count.toString());
  count += 1
  return wrap(value, p, A, A);
}

export function wrap(value: any, p: any, A: IType, B: IType): any {
  // These built-ins are not proxy aware and break.
  if(value instanceof RegExp ||
     value instanceof Date ||
     value instanceof Buffer) {
    return value;
  }

  var a: TypeKind = A.kind();
  var b: TypeKind = B.kind();

  if (a === b) {
    switch (a) {
    case TypeKind.AnyType:
      return value;

    case TypeKind.BaseType:
      if (compatible_base(<BaseType> A, <BaseType> B)) {
        return wrap_base(value, p, <BaseType> A);
      }
      break;

    case TypeKind.FunctionType:
      if (compatible_fun(<FunctionType> A, <FunctionType> B)) {
        return wrap_fun(value, p, <FunctionType> A, <FunctionType> B);
      }
      break;

    case TypeKind.ForallType:
      if (compatible_forall(<ForallType> A, <ForallType> B)) {
        return wrap_forall(value, p, <ForallType> A, <ForallType> B);
      }
      break;

    case TypeKind.ArrayType:
      // Arrays are always compatible
      return wrap_arr(value, p, <ArrayType> A, <ArrayType> B);

    case TypeKind.DictionaryType:
      // Dictionaries are also compatible
      return wrap_dict(value, p, <DictionaryType> A, <DictionaryType> B);

    case TypeKind.ObjectType:
      if (compatible_obj(<ObjectType> A, <ObjectType> B)) {
        return wrap_obj(value, p, <ObjectType> A, <ObjectType> B);
      }
      break;

    case TypeKind.HybridType:
      if (compatible_hybrid(<HybridType> A, <HybridType> B)) {
        return wrap_hybrid(value, p, <HybridType> A, <HybridType> B);
      }
      break;


    case TypeKind.UnionType:
      if (compatible_union(<UnionType> A, <UnionType> B)) {
        return wrap_union(value, p, <UnionType> A, <UnionType> B);
      }
      break;

    case TypeKind.BoundLazyType:
    case TypeKind.LazyType:
      if (compatible_lazy(<LazyType> A, <LazyType> B)) {
        return wrap_lazy(value, p, <LazyType> A, <LazyType> B);
      }
      break;
    }
  }

  // Seal And Unseal
  if (a === TypeKind.AnyType && b === TypeKind.BoundTypeVariable) {
    return (<BoundTypeVariable> B).seal(value,p);
  }

  if (a === TypeKind.BoundTypeVariable && b === TypeKind.AnyType) {
    return (<BoundTypeVariable> A).unseal(value, p);
  }
  p.flat().blame("Non-compatible types A:" + A.description + ",kind: "
                 + TypeKind[a] + "\n" +
                 "B:" + B.description + ",kind: "
                 + TypeKind[b] + "\n"
                );
  return value;
}


function wrap_base(value: any, p: any, A: BaseType): any {
  var flatNode = p.flat();
  if (!A.contract(value)) {
    flatNode.blame("not of type " + A.description + ": type is " + typeof value)
  }
  return value;
}

function wrap_fun(value: any, p: any, A: FunctionType, B: FunctionType) {
  // Checking if value is a function
  if (typeof value !== "function") {
    p.flat().blame("not of type Fun: type is " + typeof value);
    return value;
  }

  var blameLabelsP = p.fun();

  return new Proxy(value, {
    get: function(target, name, receiver) {
      if (name === 'toJSON') {
        return function() {
          return target; }
      } else {
        return Reflect.get(target,name);
      }
    },
    apply: function (target: any, thisValue: any, args: any[]): any {
      var appNodes = blameLabelsP.genApplicationNodes();
      var pDom = appNodes.dom;
      var pCod = appNodes.cod;
      
      var nArgs: number = args.length;
      var minArgs: number = A.requiredParameters.length;
      var maxArgs: number = (A.requiredParameters.length + A.optionalParameters.length);

      if (nArgs < minArgs) {
        pDom.flat().blame(
          "not enough arguments, expected >=" + minArgs + ", got: " + nArgs,null);
        return Reflect.apply(target,thisValue,args);
      }

      if (nArgs > maxArgs && !A.restParameter) {
        pDom.flat().blame(
          "too many arguments, expected <=" + maxArgs + ", got: " + nArgs,null);
        return Reflect.apply(target,thisValue,args);
      }

      var wrapped_args: any[] = [];
      for (var i = 0; i < A.requiredParameters.length; i++) {
        wrapped_args.push(
          wrap(args[i], pDom, B.requiredParameters[i], A.requiredParameters[i]));
      }

      for (var j = 0; j < A.optionalParameters.length && (i + j) < args.length; j++) {
        wrapped_args.push(
          wrap(args[i + j], pDom,
               union(B.optionalParameters[j],Null),
               union(A.optionalParameters[j],Null)));
      }

      for (var k = i + j; k < args.length; k++) {
        wrapped_args.push(
          wrap(args[k], pDom, B.restParameter, A.restParameter));
      }
      
      var ret = Reflect.apply(target,thisValue,wrapped_args);
      return wrap(ret, pCod, A.returnType, B.returnType);
    },
    construct: function (target: any, args: any[]): any {
      var nArgs: number = args.length;
      var minArgs: number = A.requiredParameters.length;
      var maxArgs: number = (A.requiredParameters.length + A.optionalParameters.length);

      // Create the instance
      var instance = Object.create(target.prototype);

      var appNodes = blameLabelsP.genApplicationNodes();
      var pDom = appNodes.dom;
      var pCod = appNodes.cod;
      
      if (nArgs < minArgs) {
        pDom.flat().blame(
          "not enough arguments, expected >=" + minArgs + ", got: " + nArgs,null);
        Reflect.apply(target,instance,args);
        return instance;
      }

      if (nArgs > maxArgs && !A.restParameter) {
        pDom.flat().blame(
          "too many arguments, expected <=" + maxArgs + ", got: " + nArgs,null);
        Reflect.apply(target,instance,args);
        return instance;
      }

      var wrapped_args: any[] = [];

      for (var i = 0; i < A.requiredParameters.length; i++) {
        wrapped_args.push(
          wrap(args[i], pDom,B.requiredParameters[i], A.requiredParameters[i]));
      }

      for (var j = 0; j < A.optionalParameters.length && (i + j) < args.length; j++) {
        wrapped_args.push(
          wrap(args[i + j], pDom,
               union(B.optionalParameters[j],Null),
               union(A.optionalParameters[j],Null)));
      }

      for (var k = i + j; k < args.length; k++) {
        wrapped_args.push(
          wrap(args[k], pDom, B.restParameter, A.restParameter));
      }

      var cons_instance = wrap(instance, pCod, A.constructType, B.constructType);
      Reflect.apply(target,instance,wrapped_args);
      return cons_instance;
    }
  });
}

function wrap_forall(value: any, p: any, A: ForallType, B: ForallType): any {
  function fresh_wrap(value: any): any {
    var XX = new BoundTypeVariable(A.tyvar + "'");
    var A_XX: IType = substitute_tyvar(A.type, A.tyvar, XX);
    var B_prim: IType = substitute_tyvar(B.type, B.tyvar, Any);
    return wrap(value, p, A_XX, B_prim);
  }

  if (typeof value !== "function") {
    return fresh_wrap(value);
  }

  return new Proxy(value, {
    get: function(target, name, receiver) {
      if (name === 'toJSON') {
        return function() {
          return target; }
      } else {
        return Reflect.get(target,name);
      }
    },
    apply: function (target: any, thisValue: any, args: any[]): any {
      var wrapped_fun = fresh_wrap(target);
      return Reflect.apply(wrapped_fun,thisValue, args);
    }
  });
}

function is_index(value: string): boolean {
  // Bitwise necessary for checking if the number is array index
  if(typeof value === 'symbol') {
        return false;
    }
  var index = Number(value) >>> 0;
  return value === index.toString() && index !== (-1 >>> 0);
}

function wrap_arr(value: any, p: any, A: ArrayType, B: ArrayType): any {
  if (!(Array.isArray(value) ||
        (typeof value === "function") ||
        (typeof value === "object"))) {
    p.flat().blame("not of type Array: type is " + typeof value, null);
    return value;
  }
  if(!value || typeof value === "undefined") {
    return value;
  }
  var pObj = p.obj();
  
  return new Proxy(value, {
    get: function (target: any, name: string, receiver: any): any {
      var getNode = pObj.genGetNode("",true);
      if (name === 'toJSON') {
        return function() {
          return target; }
      }
      else if (is_index(name)) {
        return wrap(Reflect.get(target,name), getNode, A.type, B.type);
      } else {
        var res = Reflect.get(target,name);
        if(typeof res == "function") {
          return res.bind(target);
        }
        return res;
      }
    },
    set: function (target: any, name: string, val: any, receiver: any): void {
      var setNode = pObj.genSetNode("",true);
      if (is_index(name)) {
        var wrapped = wrap(val, setNode, B.type, A.type);
        Reflect.set(target,name,wrapped);
        return;
      }
      Reflect.set(target,name,val);
      return;
    }
  });
}

function wrap_dict(value: any, p: any, A: DictionaryType, B: DictionaryType): any {
  var type: string = typeof value;
  if (type !== "object" && type !== "function" || !value) {
    p.flat().blame("not of Indexable type",null);
    return value;
  }
  
  var pObj = p.obj();
  
  return new Proxy(value, {
    get: function (target: any, name: string, receiver: any): any {
      var getNode = pObj.genGetNode(name);
      if (name === 'toJSON') {
        return function() {
          return target; }
      }
      var desc = Object.getOwnPropertyDescriptor(target, name);
      if(desc !== undefined) {
        if(desc.configurable === false &&
           desc.writable === false) {
          return Reflect.get(target,name);
        }
      }
      return wrap(Reflect.get(target,name), getNode, A.type, B.type);
    },
    set: function (target: any, name: string, val: any, receiver: any): void {
      var setNode = pObj.genSetNode(name);
      target[name] = wrap(val, setNode, B.type, A.type);
    }
  });
}

function wrap_obj(value: any, p: any, A: ObjectType, B: ObjectType): any {
  var type: string = typeof value;

  if (type !== "object" && type !== "function") {
    p.flat().blame("not of type Obj: type is " + typeof value);
    return value;
  }

  if (!value) {
    return value;
  }

  var pObj = p.obj();
  
  return new Proxy(value, {
    get: function (target: any, name: string, receiver: any): any {
      var getNode = pObj.genGetNode(name);
      var res = Reflect.get(target,name);
      if (Object.prototype.hasOwnProperty.call(A.properties, name)) {
        var A_type: IType = A.properties[name];
        var B_type: IType = B.properties[name];
        var desc = Object.getOwnPropertyDescriptor(target, name);
        if (desc !== undefined) {
          if (!desc.configurable && !desc.writable) {
            return res;
          }
        }
        return wrap(res, getNode, A_type, B_type);
      } else {
        return res;
      }
    },
    set: function (target: any, name: string, val: any, receiver: any): void {
      var setNode = pObj.genSetNode(name);
      if (Object.prototype.hasOwnProperty.call(A.properties, name)) {
        var A_type: IType = A.properties[name];
        var B_type: IType = B.properties[name];
        Reflect.set(target,name,wrap(val, setNode, B_type, A_type));
        return;
      }
      Reflect.set(target,name,val);
      return;
    }
  });
}

function wrap_hybrid(value: any, p: any, A: any, B: HybridType): any {
  var interNode = p.inter(A.types.length,A.types);
  return A.types.reduce((value, type, i) => {
    var iNode = interNode.genBranchNode(i);
    return wrap(value, iNode, A.types[i], B.types[i]);
  }, value);
}

function wrap_lazy(value: any, p: any, A: LazyType, B: LazyType): any {
  return wrap(value, p, A.resolve(), B.resolve());
}

// Currently this just works as a nullable type
function wrap_union(value: any, p: any, A: UnionType, B: UnionType): any {
  if(!value) {
    return value
  }
  if(typeof value === undefined) {
    return value;
  }
  return wrap(value, p, A.types[0], B.types[0]);
}

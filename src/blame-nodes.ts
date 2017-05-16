///<reference path="../lib/node.d.ts" />
import Blame = require('./blame');

interface Path {
  tag: string;
}

interface PathFlat extends Path {
  description: string;
}

interface PathInter extends Path {
}

interface PathApp extends Path {
  id: number;
  isDomain: boolean; // or Codomain
}

interface PathGet extends Path {
  id: number;
  prop: string;
}

interface PathSet extends Path {
  id: number;
  prop: string;
}

function is_index(value: string): boolean {
  // Bitwise necessary for checking if the number is array index
  var index = Number(value) >>> 0;
  return value === index.toString() && index !== (-1 >>> 0);
}

function create(tag, extra?): any {
  extra = extra || {};
  switch(tag) {
  case 'flat'  : return {tag: tag, description: extra.description || ""};
  case 'inter' : return {tag: tag};
  case 'app'   : return {tag: tag, id: extra.id, isDomain: extra.isDomain};
  case 'get'   : return {tag: tag, prop: extra.prop,
                         id: extra.id, isArray: extra.isArray};
  case 'set'   : return {tag: tag, prop: extra.prop,
                         id: extra.id, isArray: extra.isArray};
  default      : throw new Error("Unrecognised path tag " + tag);
  }
}

function removePropsFromTag(path: any): any {
  switch(path.tag) {
  case 'flat'  : return path;
  case 'inter' : return path;
  case 'app'   : return path;
  case 'get'   : return {tag: path.tag, prop: "", id: path.id};
  case 'set'   : return {tag: path.tag, prop: "", id: path.id};
  default      : throw new Error("Unrecognised path tag " + path);
  }
}

function prettyPrintPath(path: any): string {
  switch(path.tag) {
  case 'flat'  : return "FLAT[" + path.description + "]";
  case 'inter' : return "INTER";
  case 'app'   : return path.isDomain ? "DOM" : "COD";
  case 'get'   : return path.isArray ? "GET_ARRAY[]" : "GET["  + path.prop + "]";
  case 'set'   : return path.isArray ? "SET_ARRAY[]" : "SET["  + path.prop + "]";
  default      : throw new Error("Unrecognised path tag " + path);
  }
}

function pathToString(path: any): string {
  switch(path.tag) {
  case 'flat'  : return "FLAT"
  case 'inter' : return "INTER";
  case 'app'   : return "APP";
  case 'get'   : return path.isArray ? "GET_ARRAY[]" : "GET["  + path.prop + "]";
  case 'set'   : return path.isArray ? "SET_ARRAY[]" : "SET["  + path.prop + "]";
  default      : throw new Error("Unrecognised path tag " + path);
  }
}

function pathToStringID(path: any): string {
  switch(path.tag) {
  case 'flat'  : return "FLAT"
  case 'inter' : return "INTER";
  case 'app'   : return "APP" + "[" + path.id + "]";
  case 'get'   : return path.isArray ? "GET_ARRAY[][" + path.id + "]" :
      "GET["  + path.prop + "][" + path.id + "]";
  case 'set'   : return path.isArray ? "SET_ARRAY[][" + path.id + "]" :
      "SET["  + path.prop + "][" + path.id + "]";
  default      : throw new Error("Unrecognised path tag " + path);
  }
}

export enum BLAME_POLARITY {
  POSITIVE,
  NEGATIVE
}

enum CHILD_TAGS {
  DOM,
  COD,
  GET,
  SET,
  FLAT
}

enum PATH_BRANCH {
  FUN,
  GET,
  SET,
  FLAT
}

interface PathDescriptor {
  prev?: PathDescriptor;
  type: PATH_BRANCH;
  prop?: string;
}

function pathDescToList(desc: PathDescriptor): any[] {
  function inner(_desc: PathDescriptor, accum: any[]) {
    if(!_desc) { return accum; }
    accum.push({type: _desc.type, prop: _desc.prop});
    return inner(_desc.prev,accum);
  }
  return inner(desc,[]).reverse();
}

function pathDescEntryToString(desc: PathDescriptor): string {
  var str = "";
  switch(desc.type) {
  case PATH_BRANCH.FUN:
    str = "FUN";
    break;
  case PATH_BRANCH.GET:
    str = "GET[" + desc.prop + "]";
    break;
  case PATH_BRANCH.SET:
    str = "SET[" + desc.prop + "]";
    break;
  case PATH_BRANCH.FLAT:
    str = "FLAT";
    break;
  default: throw new Error("Unrecognised tag type: " + desc.type);
  }
  return str;
}

function pathDescToString(desc: PathDescriptor): string {
  if(!desc) {
    return "";
  }
  var str = "";
  switch(desc.type) {
  case PATH_BRANCH.FUN:
    str = "FUN";
    break;
  case PATH_BRANCH.GET:
    str = "GET[" + desc.prop + "]";
    break;
  case PATH_BRANCH.SET:
    str = "SET[" + desc.prop + "]";
    break;
  case PATH_BRANCH.FLAT:
    str = "FLAT";
    break;
  default: throw new Error("Unrecognised tag type: " + desc.type);
  }
  var res = pathDescToString(desc.prev);
  return (res + '/' + str);
}
 
interface BranchInfo {
  root: IntersectionNode;
  branch: number;
}
  
function negatePolarity(polarity: BLAME_POLARITY): BLAME_POLARITY {
  switch(polarity) {
  case BLAME_POLARITY.POSITIVE: return BLAME_POLARITY.NEGATIVE;
  case BLAME_POLARITY.NEGATIVE: return BLAME_POLARITY.POSITIVE;
  default: throw new Error("Unknown blame polarity: " + polarity);
  }
}

function polarityAsString(polarity: BLAME_POLARITY): string {
  switch(polarity) {
  case BLAME_POLARITY.POSITIVE: return "+ POSITIVE +";
  case BLAME_POLARITY.NEGATIVE: return "- NEGATIVE -";
  default: throw new Error("Unknown blame polarity: " + polarity);
  }
}

function tagToString(tag: any) {
  var str = "";
  switch(tag.type) {
  case CHILD_TAGS.GET:
    str = "GET[" + tag.prop + "]";
    break;
  case CHILD_TAGS.SET:
    str = "SET[" + tag.prop + "]";
    break;
  case CHILD_TAGS.DOM:
    str = "FUN";
    break;
  case CHILD_TAGS.COD:
    str = "FUN";
    break;
  case CHILD_TAGS.FLAT:
    str = "FLAT";
    break;
  default: throw new Error("Unrecognised tag type: " + tag.type);
  }
  return str;
}

function tagToStringID(tag: any) {
  var str = "";
  switch(tag.type) {
  case CHILD_TAGS.GET:
    str = "GET[" + tag.prop + "]_" + tag.idx;
    break;
  case CHILD_TAGS.SET:
    str = "SET[" + tag.prop + "]_" + tag.idx;
    break;
  case CHILD_TAGS.DOM:
    str = "FUN_" + tag.idx;
    break;
  case CHILD_TAGS.COD:
    str = "FUN_" + tag.idx;
    break;
  case CHILD_TAGS.FLAT:
    str = "FLAT";
    break;
  default: throw new Error("Unrecognised tag type: " + tag.type);
  }
  return str;
}

function reportBlame(message: string, event?: any): void {
  var blameErrorStr = message;
  if(event) {
    blameErrorStr =
      polarityAsString(event.polarity) +
      " " + event.path.map(prettyPrintPath).join("/") + " " +
      message;
  }
  switch(Blame.BLAME_ERROR_LEVEL) {
  case Blame.BLAME_ERROR_LEVEL_TYPE.FATAL:
    throw new Error(blameErrorStr);
  case Blame.BLAME_ERROR_LEVEL_TYPE.LOG:
    console.log(blameErrorStr);
    return;
  case Blame.BLAME_ERROR_LEVEL_TYPE.SILENT:
  default:
    return;
  }
}

class Node {
  protected path: Path[];
  protected parent: Node;

  constructor(_parent: Node,
              _path: Path[]) {
    this.parent = _parent;
    this.path = _path || [];
  }

  public _blame(event: any): void {
    // override
  }

  public flat(): FlatNode {
    return new FlatNode(this,this.path);
  }

  public seal(): FlatNode {
    return new SealNode(this,this.path);
  }
  
  public fun(): FunctionNode {
    return new FunctionNode(this,this.path);
  }
  
  public obj(): ObjectNode {
    return new ObjectNode(this,this.path);
  }

  public inter(size: number, ty: Blame.IType[]): IntersectionNode {
    return new IntersectionNode(this,this.path,size,ty);
  }
  
}

export class BaseNode extends Node {
  // Can use path for debugging
  protected label: string;

  constructor(_label: string) {
    super(null,[]);
    this.label = _label; 
  }

  public msg(m: string): string {
    var message: string = "";
    if (m) {
      message = " " + m;
    }
    return "{" + this.label + "}[" + "PATH GOES HERE" + "]" + message;
  }

  public _blame(event: any): void {
    reportBlame(event.message,event);
  }
}

export class FlatNode extends Node {
  constructor(_parent: Node,
              _path: Path[]) {
    super(_parent,_path);
  }
  public blame(message: string): void {
    var event = {polarity: BLAME_POLARITY.POSITIVE,
                 source: "flat",
                 path: this.path,
                 message: message
            };
    this._blame(event);
  }
  public _blame(event: any): void {
    this.parent._blame(event);
  }
}

export class SealNode extends Node {
  constructor(_parent: Node,
              _path: Path[]) {
    super(_parent,_path);
  }
  public blame(message: string): void {
    var event = {polarity: BLAME_POLARITY.NEGATIVE,
                 source: "seal",
                 path: this.path,
                 message: message
            };
    this._blame(event);
  }
  public _blame(event: any): void {
    this.parent._blame(event);
  }
}

export class FunctionNode extends Node {
  private appCounter: number;
  private pairs: any;

  constructor(_parent: Node,
              _path: Path[])
  {
    super(_parent,_path);
    this.appCounter = 0;
    this.pairs = {};
  }

  public genApplicationNodes(): {dom: Node; cod: Node} {
    this.pairs[this.appCounter] = true;
    var pathDom = create("app",{id: this.appCounter, isDomain: true});
    var pathCod = create("app",{id: this.appCounter, isDomain: false});
    
    var nodes = {
      dom: new DomNode(this,
                       this.path.concat(pathDom),
                       this.appCounter),
      cod: new CodNode(this,
                       this.path.concat(pathCod),
                       this.appCounter)
    };
    this.appCounter = this.appCounter + 1;
    return nodes;
  }

  private handleDom(event: any): void {
    event.source = "app";
    switch(event.polarity) {
    case BLAME_POLARITY.POSITIVE:
      this.pairs[event.idx] = false;
      event.polarity = BLAME_POLARITY.NEGATIVE;
      this.parent._blame(event);
      return;
    case BLAME_POLARITY.NEGATIVE:
      event.polarity = BLAME_POLARITY.POSITIVE;
      this.parent._blame(event);
      return;
    }
  }

  private handleCod(event: any): void {
    event.source = "app";
    switch(event.polarity) {
    case BLAME_POLARITY.POSITIVE:
      if(this.pairs[event.idx]) {
        this.parent._blame(event);
      }
      return;
    case BLAME_POLARITY.NEGATIVE:
      this.parent._blame(event);
      return;
    }
  }
  
  public _blame(event: any): void {
    if(event) {
      switch(event.source) {
      case "dom":
        /*
          If dom is negative then raise positive blame.
          If dom is positive then set local state dom to positive
          and raise negative blame.
        */
        this.handleDom(event);
        return;
      case "cod":
        /*
          If cod is negative then raise negative.
          If cod is positive then raise positive 
          only if dom has not raised positive.
        */
        this.handleCod(event);
        return;
      default: throw new Error("Unrecognised tag: " + event.source);
      }
      
    } else {
      // Something I'm not sure, probably just pass to parent.
    }
  }
}

export class DomNode extends Node {
  private appCount: number;

  constructor(_parent: Node,
              _path: Path[],
              _appCount: number) {
    super(_parent,_path);
    this.appCount = _appCount;
  }
  
  public _blame(event: any): void {
    event.source = "dom";
    event.idx = this.appCount;
    this.parent._blame(event);
  }
}

export class CodNode extends Node {
  private appCount: number;

  constructor(_parent: Node,
              _path: Path[],
              _appCount: number) {
    super(_parent,_path);
    this.appCount = _appCount;
  }
  
  public _blame(event: any): void {
    event.source = "cod";
    event.idx = this.appCount;
    this.parent._blame(event);
  }
}

export class ObjectNode extends Node {
  private getFieldCounters: number;
  private setFieldCounters: number;
  private hasRaisedNegative: boolean;
  
  constructor(_parent: Node,
              _path: Path[]) {
    super(_parent,_path);
    this.getFieldCounters = 0;
    this.setFieldCounters = 0;
    this.hasRaisedNegative = false;
  }
  
  public genGetNode(prop:string,isArray?: boolean): Node {
    var i = this.getFieldCounters;
    this.getFieldCounters = i + 1;
    var newPath = this.path.concat(
      create("get",{prop:prop, id:i, isArray: !!isArray}));
    return new GetNode(this,newPath,i,prop);
  }

  public genSetNode(prop:string,isArray?: boolean): Node {
    var i = this.setFieldCounters;
    this.setFieldCounters = i + 1;
    var newPath = this.path.concat(
      create("set",{prop:prop, id:i, isArray: !!isArray}));
    return new SetNode(this,newPath,i,prop);
  }

  private handleGet(event: any): void {
    event.source = "obj";
    this.parent._blame(event);
  }

  private handleSet(event: any): void {
    this.hasRaisedNegative = true;
    event.source = "obj";
    event.polarity = negatePolarity(event.polarity);
    this.parent._blame(event);
  }
  
  public _blame(event: any): void {
    if(event) {
      switch(event.source) {
      case "get":
        this.handleGet(event);
        return;
      case "set":
        this.handleSet(event);
        return;
      default: throw new Error("Unrecognised tag: " + event.source);
      }
    }
    return;
  }
}

export class GetNode extends Node {
  private idxCount: number;
  private prop: string;

  constructor(_parent: Node,
              _path: Path[],
              _idxCount: number,
              _prop : string) {
    super(_parent,_path);
    this.idxCount = _idxCount;
    this.prop = _prop;
  }
  
  public _blame(event: any): void {
    event.source = "get";
    event.idx = this.idxCount;
    this.parent._blame(event);
  }
}

export class SetNode extends Node {
  private idxCount: number;
  private prop: string;
  
  constructor(_parent: Node,
              _path: Path[],
              _idxCount: number,
              _prop: string) {
    super(_parent,_path);
    this.idxCount = _idxCount;
    this.prop = _prop;
  }
  
  public _blame(event: any): void {
    event.source = "set";
    event.idx = this.idxCount;
    this.parent._blame(event);
  }
}

class BranchNode extends Node {
  private branch: number;
  constructor(_parent: Node,
              _path: Path[],
              _branch: number) {
    super(_parent,_path);
    this.branch = _branch;
  }

  public _blame(event:any): void {
    event.idx = this.branch;
    this.parent._blame(event);
  }
  
}

export class IntersectionNode extends Node {
  private ty: Blame.IType[];
  private size: number;
  private branches: boolean[];
  private messages: string[];
  private apps: any;
  
  constructor(_parent: Node,
              _path: Path[],
              _size: number,
              _ty: Blame.IType[]) {
    super(_parent,_path);
    this.size = _size;
    this.ty = _ty;
    this.branches = [];
    this.messages = [];
    for(var i in this.ty) {
      this.branches[i] = false
    }
    this.apps = {};
  }

  public genBranchNode(idx: number): Node {
    if (idx < this.size) {
      return new BranchNode(this,[],idx);
    } else {
      throw new Error("Requested branch exceeds size of intersection");
    }    
  }

  private isFunction(p: any[], ty: Blame.IType): boolean {
    if(p.length == 0) return false;

    if(ty.kind() == Blame.TypeKind.HybridType) {
      var hy = <Blame.HybridType> ty;
      return hy.types.map((x) => (this.isFunction(p,x))).some(x => x);
    }

    if(ty.kind() == Blame.TypeKind.UnionType) {
      var un = <Blame.UnionType> ty;
      return hy.types.map((x) => (this.isFunction(p,x))).some(x => x);
    }
    
    var t = p[0]; /* At the end, should be either app, set */
    if(p.length == 1) {
      if(t.tag == "app" && (ty.kind() == Blame.TypeKind.FunctionType)) {
        return true;
      }
      if(t.tag == "app" && (ty.kind() == Blame.TypeKind.ForallType)) {
        var fa = <Blame.ForallType> ty;
        return this.isFunction(p,fa.type);
      }
      if(t.tag == "set" && (ty.kind() == Blame.TypeKind.ObjectType)) {
        var o = <Blame.ObjectType> ty;
        return !!o.properties[t.prop];
      }
      if(t.tag == "set" && (ty.kind() == Blame.TypeKind.ArrayType)) {
        return (t.isArray || is_index(t.prop))
      }
      if(t.tag == "set" && (ty.kind() == Blame.TypeKind.DictionaryType)) {
        return true;
      }
      return false;
    }
    if(t.tag == "get") {
      switch(ty.kind()) {
      case Blame.TypeKind.ObjectType: {
        var o = <Blame.ObjectType> ty;
        if(o.properties[t.prop]) {
          return this.isFunction(p.slice(1),
                                 o.properties[t.prop]);
        } else {
          return false
        }
      }
      case Blame.TypeKind.ArrayType: {
        if(t.isArray || is_index(t.prop)) {
          var at = <Blame.ArrayType> ty;
          return this.isFunction(p.slice(1),at.type);
        }
        return false;
      }
      case Blame.TypeKind.DictionaryType: {
        var at = <Blame.DictionaryType> ty;
        return this.isFunction(p.slice(1),at.type);
      }
      default: return false
      }
    }
  }
  
  private isObjectBlame(p: Path[]): boolean {
    for(var i in p) {
      var segment = p[i];
      if(segment.tag == "set") {
        return true;
      }
      if(segment.tag == "app") {
        return false;
      }
    }
    throw new Error("Could not find negative path element " + p);
  }

  private truncate(p: Path[]): Path[] {
    var res = [];
    for(var j in p) {
      var segment = p[j];
      res.push(segment);
      if(segment.tag == "app") {
        break;
      }
    }
    return res;
  }
  
  public _blame(event: any): void {
    var id = event.idx;
    switch(event.polarity) {
    case BLAME_POLARITY.POSITIVE:
      event.path = this.path.concat(event.path);
      this.parent._blame(event);
      return
    case BLAME_POLARITY.NEGATIVE:
      var truncated = this.truncate(event.path);
      if(!this.isObjectBlame(event.path)) {
        truncated = this.truncate(event.path);
      }
      /* Remove props because array accesses should match anything 
         E.g. get[x][0] is the same as get_dict[0] and get_array["1"][0]
      */
      var truncated_str = truncated.map(removePropsFromTag).
        map(pathToStringID).join("/");
      
      if(!this.apps[truncated_str]) {
        this.apps[truncated_str] = {};
      }
      this.apps[truncated_str][id] = true;

      // Store blame message
      var mpath = this.path.concat(event.path)
      var m = "ID=" +
        id + "/" + mpath.map(prettyPrintPath).join("/") + " " + event.message;
      if(!this.messages[truncated_str]) { this.messages[truncated_str] = {}};
      this.messages[truncated_str][id] = m;
      
      var funBranches = [];
      for(var i in this.ty) {
        if(this.isFunction(truncated,this.ty[i]) &&
           !this.branches[i]) {
          funBranches.push(i);
        }
      }
      var allBlamed = funBranches.every(
        (v) => (this.apps[truncated_str][v]));

      if(allBlamed) {
        var allMessages = [];
        funBranches.map(b => allMessages.push(this.messages[truncated_str][b]));
        event.path = this.path.concat(event.path);
        event.message = "INTER{ " + allMessages.join("\n") + "}";
        this.parent._blame(event);
      }
      return;
    }
  }
}

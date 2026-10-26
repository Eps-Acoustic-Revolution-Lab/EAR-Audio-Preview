/** CSP-safe Emscripten bindings for the pinned Essentia browser runtime.
 * Replace dynamic source generation with equivalent closures, preserving wire conversions.
 */
const crypto = require("crypto");
const ts = require("typescript");
module.exports = function (source) {
  const hash = crypto.createHash("sha256").update(source).digest("hex");
  if (
    hash !== "ea8891410df550d2b5a0ae53e64809516196f59607385b02475d79cd5a7df89f"
  )
    throw new Error(
      "Essentia browser runtime changed; review CSP binding adaptations",
    );
  const replacements = {
    __emval_get_method_caller: `function __emval_get_method_caller(argCount, argTypes) { var types=__emval_lookupTypes(argCount,argTypes), retType=types[0]; return __emval_addMethodCaller(function(handle,name,destructors,args) { var values=[],offset=0; for(var i=1;i<types.length;i++) { values.push(types[i].readValueFromPointer(args+offset)); offset+=types[i].argPackAdvance; } var value=handle[name].apply(handle,values); for(var i=1;i<types.length;i++) { if(types[i].deleteObject) types[i].deleteObject(values[i-1]); } if(!retType.isVoid) return retType.toWireType(destructors,value); }); }`,
    createNamedFunction: `function createNamedFunction(name, body) { return function() { "use strict"; return body.apply(this, arguments); }; }`,
    makeDynCaller: `function makeDynCaller(dynCall) { return function() { return dynCall.apply(null, [rawFunction].concat(Array.prototype.slice.call(arguments, 0, signature.length - 1))); }; }`,
    craftEmvalAllocator: `function craftEmvalAllocator(argCount) { return function(constructor, argTypes, args) { var values = []; for (var i = 0; i < argCount; i++) { var type = requireRegisteredType(Module.HEAP32[(argTypes >>> 2) + i], 'parameter ' + i); values.push(type.readValueFromPointer(args)); args += type.argPackAdvance; } return __emval_register(Reflect.construct(constructor, values)); }; }`,
    craftInvokerFunction: `function craftInvokerFunction(humanName, argTypes, classType, cppInvokerFunc, cppTargetFunc) {
      var isMethod = argTypes[1] !== null && classType !== null;
      var needsStack = argTypes.slice(1).some(function(type) { return type !== null && type.destructorFunction === undefined; });
      return function() {
        if (arguments.length !== argTypes.length - 2) throwBindingError('function ' + humanName + ' called with ' + arguments.length + ' arguments, expected ' + (argTypes.length - 2) + ' args!');
        var destructors = needsStack ? [] : null, wired = [], types = [], args = [cppTargetFunc];
        if (isMethod) { wired.push(argTypes[1].toWireType(destructors, this)); types.push(argTypes[1]); }
        for (var i = 0; i < arguments.length; i++) { wired.push(argTypes[i + 2].toWireType(destructors, arguments[i])); types.push(argTypes[i + 2]); }
        var value = cppInvokerFunc.apply(null, args.concat(wired));
        if (needsStack) { runDestructors(destructors); } else { for (var i = 0; i < types.length; i++) { if (types[i].destructorFunction !== null) types[i].destructorFunction(wired[i]); } }
        if (argTypes[0].name !== 'void') return argTypes[0].fromWireType(value);
      };
    }`,
  };
  const ast = ts.createSourceFile(
    "essentia.js",
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const edits = [];
  const seen = new Set();
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && replacements[node.name?.text]) {
      const name = node.name.text;
      if (seen.has(name)) throw new Error("Duplicate runtime binding " + name);
      seen.add(name);
      edits.push({
        start: node.getStart(ast),
        end: node.end,
        text: replacements[name],
      });
    } else ts.forEachChild(node, visit);
  }
  visit(ast);
  if (seen.size !== 5) throw new Error("Missing Essentia runtime bindings");
  for (const edit of edits.sort((a, b) => b.start - a.start))
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  source = source.replace(
    "var ENVIRONMENT_IS_WEB=true;var ENVIRONMENT_IS_WORKER=false;",
    "var ENVIRONMENT_IS_WEB=false;var ENVIRONMENT_IS_WORKER=true;",
  );
  if (/new Function|new_\(Function/.test(source))
    throw new Error("Dynamic JS remains in Essentia runtime");
  return source;
};

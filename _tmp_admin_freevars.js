const fs = require('fs');
const path = 'd:/plumber_org/ver_4/plumber-hub-expo/src/screens/AdminDashboard.js';
const code = fs.readFileSync(path, 'utf8');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const ast = parser.parse(code, {
  sourceType: 'module',
  plugins: ['jsx','classProperties','objectRestSpread','optionalChaining','nullishCoalescingOperator','dynamicImport']
});

function isWithin(scope, ancestor){
  let s = scope;
  while (s) {
    if (s === ancestor) return true;
    s = s.parent;
  }
  return false;
}

function analyze(fnName){
  let targetPath = null;
  traverse(ast, {
    VariableDeclarator(p){
      if (p.node.id && p.node.id.type === 'Identifier' && p.node.id.name === fnName) {
        const init = p.node.init;
        if (init && (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')) {
          targetPath = p;
          p.stop();
        }
      }
    }
  });
  if(!targetPath){
    console.error('not found', fnName);
    return;
  }
  const fnPath = targetPath.get('init');
  const fnScope = fnPath.scope;
  const free = new Set();
  const knownGlobals = new Set(['console','Math','Date','JSON','Object','Array','String','Number','Boolean','Promise','setTimeout','clearTimeout','setInterval','clearInterval','window','document']);
  fnPath.traverse({
    Identifier(p){
      if (!p.isReferencedIdentifier()) return;
      const n = p.node.name;
      if (knownGlobals.has(n)) return;
      const binding = p.scope.getBinding(n);
      if (!binding) {
        free.add(n);
        return;
      }
      if (!isWithin(binding.scope, fnScope)) {
        free.add(n);
      }
    }
  });
  const arr = [...free].sort();
  console.log('---'+fnName+'---');
  console.log(arr.join('\n'));
}

analyze('renderAnalytics');
analyze('renderOrders');

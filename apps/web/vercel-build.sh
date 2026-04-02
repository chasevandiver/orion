#!/bin/bash
set -e

echo "=== CWD ==="
pwd

echo "=== tailwindcss in parent node_modules? ==="
ls ../../node_modules/tailwindcss 2>&1 | head -3 || echo "NOT at ../../node_modules"

echo "=== tailwindcss in local node_modules? ==="
ls ./node_modules/tailwindcss 2>&1 | head -3 || echo "NOT at ./node_modules"

echo "=== what IS in ../../node_modules? (first 20) ==="
ls ../../node_modules 2>&1 | head -20 || echo "no ../../node_modules"

echo "=== require.resolve test ==="
node -e "
try {
  var p = require.resolve('tailwindcss');
  console.log('FOUND via plain require:', p);
} catch(e) {
  console.log('plain require FAIL:', e.message);
}
try {
  var p2 = require.resolve('tailwindcss', {paths:[process.cwd()]});
  console.log('FOUND via paths CWD:', p2);
} catch(e) {
  console.log('paths CWD FAIL:', e.message);
}
"

echo "=== running next build ==="
next build

#!/bin/bash
set -e

echo "=== CWD ==="
pwd

echo "=== tailwindcss at root? ==="
ls /vercel/path0/node_modules/tailwindcss 2>&1 | head -3 || echo "NOT FOUND at root"

echo "=== recharts at root? ==="
ls /vercel/path0/node_modules/recharts 2>&1 | head -1 || echo "NOT FOUND at root"

echo "=== apps/web local node_modules? ==="
ls /vercel/path0/apps/web/node_modules 2>&1 | head -5 || echo "no local node_modules"

echo "=== require.resolve test ==="
node -e "
try {
  var p = require.resolve('tailwindcss', {paths:['/vercel/path0/apps/web']});
  console.log('FOUND:', p);
} catch(e) {
  console.log('FAIL:', e.message);
}
"

echo "=== running next build ==="
npm run build -w @orion/web

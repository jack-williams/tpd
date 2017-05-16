#!/usr/bin/env bash
echo "Compiling wrap-gen..."
./lib/typescript/bin/tsc --module commonjs ./src/wrap-gen.ts
echo "Done"
echo "Compiling blame-nodes..."
./lib/typescript/bin/tsc --module commonjs ./src/blame-nodes.ts
echo "Done"
echo "Compiling blame..."
./lib/typescript/bin/tsc --module commonjs ./src/blame.ts
echo "Done"
echo "Moving to ./build..."
mkdir -p build
mv ./src/wrap-gen.js ./build/
mv ./src/blame-nodes.js ./build/
mv ./src/blame.js ./build/
echo "Done"

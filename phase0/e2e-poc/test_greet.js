const assert = require('node:assert/strict');
const { greet } = require('./src/greet');

assert.strictEqual(greet('AIEO'), 'Hello, AIEO!');
console.log('test_greet: PASS');

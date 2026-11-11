const assert = require('assert');
const add = require('./src/e2e_add.js');

assert.strictEqual(add(2, 3), 5);
assert.strictEqual(add(-1, 1), 0);

console.log('TEST PASS');

/**
 * Run with:  npm run test:sms
 *
 * The phone parser decides whether a customer gets their text, and the message decides
 * what it costs: anything outside plain ASCII flips the whole SMS to UCS-2 encoding.
 */

import { normalizeUsPhone, phoneError, readyMessage } from './sms';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  if (actual !== expected) {
    failures++;
    console.error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// Ways people really type a number
for (const input of ['(312) 867-5309', '312-867-5309', '312.867.5309', '3128675309', '+1 312 867 5309', '1 (312) 867-5309']) {
  check(`accepts ${input}`, normalizeUsPhone(input), '+13128675309');
}

// Not a US mobile number
for (const input of ['', '555-0199', '012 555 0199', '312 055 0199', '+44 20 7946 0958', '312555019', '31255501999', 'call me', '212-555-0123']) {
  check(`rejects ${JSON.stringify(input)}`, normalizeUsPhone(input), null);
}

check('empty phone error', phoneError('') !== '', true);
check('good phone no error', phoneError('312 867 5309'), '');

// Message
const msg = readyMessage('Sarah K');
check('message names the customer', msg.includes('Hi Sarah K,'), true);
check('message says who it is from', msg.startsWith('LOTG Coffee:'), true);
check('message has opt-out', msg.includes('Reply STOP'), true);
check('message is one GSM segment', msg.length <= 160, true);

const fancy = readyMessage('José ☕ O’Brien');
check('fancy name stays ASCII', /^[\x20-\x7E]*$/.test(fancy), true);
check('accent kept as plain letter', fancy.includes('Jose'), true);

check('long name still one segment', readyMessage('A'.repeat(200)).length <= 160, true);
check('blank name', readyMessage('   ').startsWith('LOTG Coffee: Your order'), true);

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('sms: all checks passed');

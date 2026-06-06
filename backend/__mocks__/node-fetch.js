/**
 * Manual mock pentru node-fetch.
 * Plasat în backend/__mocks__/node-fetch.js
 *
 * Jest înlocuiește automat orice require('node-fetch') SAU import('node-fetch')
 * cu acest fișier când jest.mock('node-fetch') este apelat în test.
 *
 * Expunem un jest.fn() ca default export (compatibil cu modul ESM default).
 */

'use strict';

const fetchMock = jest.fn();

// Compatibil cu: const fetch = (await import('node-fetch')).default
// și cu:         const fetch = require('node-fetch')
module.exports = fetchMock;
module.exports.default = fetchMock;

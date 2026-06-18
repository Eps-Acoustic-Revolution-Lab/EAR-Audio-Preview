/* eslint-env node */
/* eslint-disable no-undef */
/** jsdom in Jest may lack structuredClone (Node < 17 / older jsdom). */
const clone = (value) => JSON.parse(JSON.stringify(value));
if (typeof global.structuredClone !== "function") {
  global.structuredClone = clone;
}

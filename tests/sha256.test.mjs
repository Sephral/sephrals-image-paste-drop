import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";

import { modulePath } from "./helpers/test-helpers.mjs";

const { sha256Hex } = await import(modulePath("scripts/sha256.js"));

const reference = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("the script SHA-256 matches Node's for every padding case", () => {
  assert.equal(sha256Hex(new Uint8Array()), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(sha256Hex(new TextEncoder().encode("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  for ( const length of [1, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 1000, 4096] ) {
    const bytes = randomBytes(length);
    assert.equal(sha256Hex(bytes), reference(bytes), `length ${length}`);
    assert.equal(sha256Hex(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)), reference(bytes), `buffer ${length}`);
  }
});

test("the script SHA-256 handles a few megabytes", () => {
  const bytes = randomBytes(3 * 1024 * 1024 + 17);
  assert.equal(sha256Hex(bytes), reference(bytes));
});

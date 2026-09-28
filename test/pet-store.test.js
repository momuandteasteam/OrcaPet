const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { discoverPets, readPet } = require('../src/pet-store');

function fixture(manifest) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orcapet-test-'));
  const directory = path.join(root, manifest.id || 'pet');
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, 'pet.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(directory, 'spritesheet.webp'), 'webp');
  return { root, directory };
}

test('reads an unchanged Codex Pet v2 manifest', (t) => {
  const { root, directory } = fixture({ id: 'rin', displayName: 'Rin', spriteVersionNumber: 2, spritesheetPath: 'spritesheet.webp' });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const pet = readPet(directory);
  assert.equal(pet.id, 'rin');
  assert.equal(pet.spriteVersionNumber, 2);
});

test('rejects unsupported sprite versions', (t) => {
  const { root, directory } = fixture({ id: 'old', displayName: 'Old', spriteVersionNumber: 1, spritesheetPath: 'spritesheet.webp' });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.match(readPet(directory).error, /未対応/);
});

test('discovers pets and de-duplicates ids by root order', (t) => {
  const first = fixture({ id: 'rin', displayName: 'Rin A', spriteVersionNumber: 2, spritesheetPath: 'spritesheet.webp' });
  const second = fixture({ id: 'rin', displayName: 'Rin B', spriteVersionNumber: 2, spritesheetPath: 'spritesheet.webp' });
  t.after(() => {
    fs.rmSync(first.root, { recursive: true, force: true });
    fs.rmSync(second.root, { recursive: true, force: true });
  });
  const result = discoverPets([first.root, second.root]);
  assert.equal(result.pets.length, 1);
  assert.equal(result.pets[0].displayName, 'Rin A');
});

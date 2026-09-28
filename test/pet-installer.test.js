const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { findPetDirectories, installPet, validateZipEntries } = require('../src/pet-installer');

function makePet(root, id = 'test-pet') {
  const directory = path.join(root, 'package', 'pet');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'pet.json'), JSON.stringify({ id, displayName: 'Test Pet', spriteVersionNumber: 2, spritesheetPath: 'spritesheet.webp' }));
  fs.writeFileSync(path.join(directory, 'spritesheet.webp'), 'sprite');
  return directory;
}

test('finds a pet directory inside a downloaded repository', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orcapet-find-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = makePet(root);
  assert.deepEqual(findPetDirectories(root), [directory]);
});

test('installs only a valid manifest and spritesheet', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orcapet-install-'));
  const destination = fs.mkdtempSync(path.join(os.tmpdir(), 'orcapet-destination-'));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(destination, { recursive: true, force: true });
  });
  const result = installPet(makePet(root), destination);
  assert.equal(result.pet.id, 'test-pet');
  assert.equal(fs.readFileSync(path.join(destination, 'test-pet', 'spritesheet.webp'), 'utf8'), 'sprite');
});

test('rejects zip traversal paths', () => {
  assert.throws(() => validateZipEntries('pet/pet.json\n../escape.txt\n'), /安全でない/);
});

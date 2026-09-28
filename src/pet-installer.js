const AdmZip = require('adm-zip');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readPet } = require('./pet-store');

function findPetDirectories(root, maxDepth = 4) {
  const found = [];
  function visit(directory, depth) {
    if (depth > maxDepth) return;
    let entries;
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return; }
    if (entries.some((entry) => entry.isFile() && entry.name === 'pet.json')) found.push(directory);
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) visit(path.join(directory, entry.name), depth + 1);
    }
  }
  visit(root, 0);
  return found;
}

function validateZipEntries(entries) {
  if (typeof entries === 'string') entries = entries.split('\n').map((entry) => ({ entryName: entry.trim(), header: { size: 0 } })).filter((entry) => entry.entryName);
  if (entries.length > 500) throw new Error('ZIP内のファイル数が多すぎます');
  let totalSize = 0;
  for (const entry of entries) {
    const normalized = entry.entryName.replaceAll('\\', '/');
    if (normalized.startsWith('/') || normalized.split('/').includes('..')) {
      throw new Error('ZIPに安全でないパスが含まれています');
    }
    totalSize += entry.header?.size || 0;
  }
  if (totalSize > 500 * 1024 * 1024) throw new Error('ZIPの展開サイズが大きすぎます');
  return entries;
}

async function resolvePetDirectory(selectedPath) {
  const stat = fs.statSync(selectedPath);
  if (stat.isDirectory()) {
    if (fs.existsSync(path.join(selectedPath, 'pet.json'))) return { directory: selectedPath, cleanup: null };
    const directories = findPetDirectories(selectedPath);
    if (directories.length !== 1) throw new Error(`Petパッケージが${directories.length}件見つかりました。pet.jsonを直接選択してください`);
    return { directory: directories[0], cleanup: null };
  }
  if (path.basename(selectedPath) === 'pet.json') return { directory: path.dirname(selectedPath), cleanup: null };
  if (!/\.(zip|codex-pet)$/i.test(selectedPath)) throw new Error('フォルダ、pet.json、ZIPのいずれかを選択してください');

  const archive = new AdmZip(selectedPath);
  validateZipEntries(archive.getEntries());
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'orcapet-install-'));
  try {
    archive.extractAllTo(temporary, true, false);
    const directories = findPetDirectories(temporary);
    if (directories.length !== 1) throw new Error(`ZIP内のPetパッケージが${directories.length}件でした。1件だけ含めてください`);
    return { directory: directories[0], cleanup: () => fs.rmSync(temporary, { recursive: true, force: true }) };
  } catch (error) {
    fs.rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

function installPet(directory, destinationRoot) {
  const pet = readPet(directory);
  if (!pet || pet.error) throw new Error(pet?.error || 'pet.jsonが見つかりません');
  fs.mkdirSync(destinationRoot, { recursive: true });
  const destination = path.join(destinationRoot, pet.id);
  let backup = null;
  if (fs.existsSync(destination)) {
    backup = `${destination}.backup-${Date.now()}`;
    fs.renameSync(destination, backup);
  }
  try {
    fs.mkdirSync(destination, { recursive: true });
    fs.copyFileSync(pet.manifestPath, path.join(destination, 'pet.json'));
    const manifest = JSON.parse(fs.readFileSync(pet.manifestPath, 'utf8'));
    const spriteDestination = path.join(destination, manifest.spritesheetPath);
    fs.mkdirSync(path.dirname(spriteDestination), { recursive: true });
    fs.copyFileSync(pet.spritesheetPath, spriteDestination);
    return { pet: readPet(destination), backup };
  } catch (error) {
    fs.rmSync(destination, { recursive: true, force: true });
    if (backup) fs.renameSync(backup, destination);
    throw error;
  }
}

module.exports = { findPetDirectories, installPet, resolvePetDirectory, validateZipEntries };

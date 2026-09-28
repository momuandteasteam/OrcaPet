const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SUPPORTED_VERSION = 2;

function defaultPetRoots(env = process.env, homedir = os.homedir()) {
  const codexHome = env.CODEX_HOME || path.join(homedir, '.codex');
  const orcaPetHome = env.ORCAPET_HOME || path.join(homedir, '.orcapet');
  return [path.join(orcaPetHome, 'pets'), path.join(codexHome, 'pets')];
}

function readPet(directory) {
  const manifestPath = path.join(directory, 'pet.json');
  if (!fs.existsSync(manifestPath)) return null;

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    return { directory, error: `pet.json を読み込めません: ${error.message}` };
  }

  if (!manifest.id || !manifest.displayName) {
    return { directory, error: 'pet.json に id または displayName がありません' };
  }
  if (manifest.spriteVersionNumber !== SUPPORTED_VERSION) {
    return { directory, error: `spriteVersionNumber ${manifest.spriteVersionNumber} は未対応です` };
  }
  if (!manifest.spritesheetPath || path.isAbsolute(manifest.spritesheetPath)) {
    return { directory, error: 'spritesheetPath が不正です' };
  }

  const resolvedDirectory = fs.realpathSync(directory);
  const spriteCandidate = path.resolve(directory, manifest.spritesheetPath);
  let spritePath;
  try {
    spritePath = fs.realpathSync(spriteCandidate);
  } catch {
    return { directory, error: `スプライトが見つかりません: ${manifest.spritesheetPath}` };
  }
  if (spritePath !== resolvedDirectory && !spritePath.startsWith(`${resolvedDirectory}${path.sep}`)) {
    return { directory, error: 'spritesheetPath が Pet フォルダの外を指しています' };
  }

  return {
    id: manifest.id,
    displayName: manifest.displayName,
    description: manifest.description || '',
    spriteVersionNumber: manifest.spriteVersionNumber,
    spritesheetPath: spritePath,
    manifestPath,
    directory
  };
}

function discoverPets(roots = defaultPetRoots()) {
  const pets = [];
  const errors = [];
  const seen = new Set();

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const pet = readPet(path.join(root, entry.name));
      if (!pet) continue;
      if (pet.error) {
        errors.push(pet);
      } else if (!seen.has(pet.id)) {
        seen.add(pet.id);
        pets.push(pet);
      }
    }
  }

  pets.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return { pets, errors };
}

function petFromSelectedPath(selectedPath) {
  if (!selectedPath) return null;
  let directory = selectedPath;
  try {
    if (fs.statSync(selectedPath).isFile()) directory = path.dirname(selectedPath);
  } catch {
    return { directory, error: '選択したパスが見つかりません' };
  }
  return readPet(directory);
}

module.exports = { SUPPORTED_VERSION, defaultPetRoots, discoverPets, petFromSelectedPath, readPet };

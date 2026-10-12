"""Extract registered kanji facts from pinned dictionary snapshots; no inferred readings."""
import argparse
import ast
import csv
import hashlib
import io
import json
from pathlib import Path
import re
import tarfile
import unicodedata
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--cache-dir', type=Path, default=Path('/tmp/kotoba-dictionary-sources'))
args = parser.parse_args()
args.cache_dir.mkdir(parents=True, exist_ok=True)
manifest = json.loads((ROOT / 'scripts/dictionary-sources.json').read_text())


def source(name):
    spec = manifest[name]
    path = args.cache_dir / name
    if not path.exists():
        request = urllib.request.Request(spec['url'], headers={'User-Agent': 'Kotoba-dictionary-extractor/1.0'})
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = response.read()
        if hashlib.sha256(payload).hexdigest() != spec['sha256']:
            raise ValueError(f'{name}: snapshot checksum mismatch')
        path.write_bytes(payload)
    payload = path.read_bytes()
    if hashlib.sha256(payload).hexdigest() != spec['sha256']:
        raise ValueError(f'{name}: cached snapshot checksum mismatch')
    return payload


with tarfile.open(fileobj=io.BytesIO(source('kanjidic')), mode='r:gz') as archive:
    dictionary = json.load(archive.extractfile('kanjidic2-all-3.6.2.json'))
entries = {e['literal']: e for e in dictionary['characters']}
korean_rows = list(csv.DictReader(io.StringIO(source('korean').decode('utf-8-sig'))))
grades = {}
for row in korean_rows:
    grades.setdefault(unicodedata.normalize('NFC', row['hanja']), []).append(row)
variants = {}
for line in source('joyo').decode().splitlines():
    parts = line.split(',')
    if len(parts) == 3 and parts[1] == 'joyo/variant':
        variants[parts[0]] = (unicodedata.normalize('NFC', parts[2]), 'joyo', line)


def base_character(s):
    return unicodedata.normalize('NFC', ''.join(c for c in s if not (0xE0100 <= ord(c) <= 0xE01EF or 0xFE00 <= ord(c) <= 0xFE0F)))


for line in source('old_style').decode().splitlines():
    parts = line.split('\t')
    if len(parts) >= 2:
        char, ref = map(base_character, parts[:2])
        if len(char) == len(ref) == 1:
            variants.setdefault(char, (ref, 'old_style', line))

book = json.loads((ROOT / 'src/data/hackers-pages-2-4.json').read_text())
characters = {unicodedata.normalize('NFC', row['character']) for row in book['kanji']}
# Read the actual base seed instead of maintaining a second hand-written kanji list.
seed_text = (ROOT / 'src/lib/seed.ts').read_text()
seed_words = re.findall(r'\["([^"\n]+)", "[^"\n]+", "[^"\n]+"\]', seed_text)
if len(seed_words) != 6:
    raise ValueError('Seed vocabulary format changed; update the extractor rather than guessing characters.')
for word in seed_words:
    characters.update(c for c in word if unicodedata.name(c, '').startswith('CJK UNIFIED IDEOGRAPH'))

patches = []
evidence = []
for char in sorted(characters):
    jp = entries[char]
    readings = [r for g in jp['readingMeaning']['groups'] for r in g['readings']]
    onyomi = list(dict.fromkeys(r['value'] for r in readings if r['type'] == 'ja_on'))
    kunyomi = list(dict.fromkeys(r['value'] for r in readings if r['type'] == 'ja_kun'))
    reference, mapping_name, mapping_line = (char, None, None) if char in grades else variants[char]
    rows = grades[reference]
    pairs = []
    for row in rows:
        for meanings, sounds in ast.literal_eval(row['meaning']):
            for hun in meanings:
                for eum in sounds:
                    # Parentheses annotate the related glyph, not part of the Korean pronunciation.
                    pair = {'hun': hun, 'eum': re.sub(r'\([^)]*\)', '', eum).strip()}
                    if pair not in pairs:
                        pairs.append(pair)
    primary = next((p for p in pairs if p['eum'] == rows[0]['main_sound']), pairs[0])
    assert onyomi and pairs and all(p['hun'] and p['eum'] for p in pairs)
    sources = [
        {'label': 'EDRDG KANJIDIC2 (2026-10-05)', 'url': 'https://www.edrdg.org/wiki/index.php/KANJIDIC_Project', 'field': 'japanese_readings', 'license': 'CC-BY-SA-4.0'},
        {'label': '한국어문회 선정한자 CSV 변환본 (rycont)', 'url': 'https://github.com/rycont/hanja-grade-dataset/blob/91a1f49c7f05492f76ce817096b3fb500830f7b9/hanja.csv', 'field': 'korean_huneum'},
    ]
    if mapping_name:
        sources.append({'label': 'CJKVI 신·구자체 대응표', 'url': manifest[mapping_name]['url'], 'field': 'character_variant'})
    patches.append({
        'id': f'k:{char}', 'character': char,
        'korean_hun': primary['hun'], 'korean_eum': primary['eum'],
        'korean_readings': pairs, 'korean_reference_character': reference,
        'onyomi': onyomi, 'kunyomi': kunyomi,
        'meanings_ko': list(dict.fromkeys(p['hun'] for p in pairs)),
        'metadata_status': 'verified', 'metadata_verified_at': '2026-10-12',
        'metadata_source': 'KANJIDIC2 / 한국어문회 선정한자 자료' + (' / CJKVI 자형 대응표' if mapping_name else ''),
        'metadata_sources': sources,
    })
    evidence.append({'character': char, 'japanese_readings': [r for r in readings if r['type'] in ('ja_on', 'ja_kun')], 'korean_reference_character': reference, 'korean_original_rows': rows, 'korean_original_pairs': [pair for row in rows for pair in ast.literal_eval(row['meaning'])], 'variant_source': mapping_name, 'variant_original_line': mapping_line})

result = {'dataset_id': 'kanji-dictionary-2026-10-12', 'schema_version': '1.0.0', 'kanji': patches, 'vocabulary': []}
(ROOT / 'src/data/kanji-dictionary.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
(ROOT / 'docs/dictionaries/extraction-evidence.json').write_text(json.dumps({'dictionary_date': dictionary['dictDate'], 'sources': manifest, 'characters': evidence}, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'kanji': len(patches), 'onyomi_present': sum(bool(k['onyomi']) for k in patches), 'kunyomi_present': sum(bool(k['kunyomi']) for k in patches), 'kunyomi_not_listed': [k['character'] for k in patches if not k['kunyomi']], 'korean_huneum_present': len(patches), 'variant_references': sum(k['character'] != k['korean_reference_character'] for k in patches)}, ensure_ascii=False))

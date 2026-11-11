import fs from 'node:fs';
import path from 'node:path';
const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/import-nov12.mjs <markdown path>');
const file = path.basename(input);
const text = fs.readFileSync(input, 'utf8').normalize('NFC');
const vocabulary = text.split('\n').filter(l => l.startsWith('| ') && !l.startsWith('| 일본어')).map(l => {
  const [word, reading, , meaning] = l.split('|').slice(1,-1).map(s=>s.trim());
  return {id:'v:'+word,word,reading,meanings_ko:meaning.split(',').map(s=>s.trim()),kanji_ids:[...new Set(word.match(/\p{Unified_Ideograph}/gu)||[])].map(c=>'k:'+c),source:file.normalize('NFC')};
});
const existing = new Map();
for(const path of ['src/data/jlpt-enriched-2026-11.json','src/data/kanji-dictionary.json']) for(const k of JSON.parse(fs.readFileSync(path)).kanji) existing.set(k.character,k);
const chars = [...new Set(vocabulary.flatMap(v=>v.kanji_ids.map(id=>id.slice(2))))];
const missing = chars.filter(c=>!existing.has(c));
fs.writeFileSync('/private/tmp/nov12-missing.json',JSON.stringify({kanji:missing.map(character=>({character}))}));
if(fs.existsSync('/private/tmp/nov12-dictionary.json')) for(const k of JSON.parse(fs.readFileSync('/private/tmp/nov12-dictionary.json')).kanji) existing.set(k.character,k);
if(chars.every(c=>existing.has(c))) fs.writeFileSync('src/data/jlpt-nov12.json',JSON.stringify({vocabulary,kanji:chars.map(c=>existing.get(c))},null,2)+'\n');
console.log({words:vocabulary.length,kanji:chars.length,missing});

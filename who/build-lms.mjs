// Builds who/who-lms.js from the official WHO LMS text tables in who/source.
// Source: WHO Anthro (2006 standards) and WHO AnthroPlus (2007 reference),
// the published tables shipped with the WHO software.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(dir, 'source');

function read(name){
  const text = fs.readFileSync(path.join(src, name), 'utf8').trim().split(/\r?\n/);
  const header = text[0].split('\t');
  const rows = text.slice(1).map(line => line.split('\t'));
  return {header, rows};
}

function packDaily(name){
  const {rows} = read(name);
  const out = {1: [], 2: []};
  rows.forEach(r => {
    const sex = r[0] === '1' ? 1 : 2;
    const age = Number(r[1]);
    out[sex][age] = [Number(r[2]), Number(r[3]), Number(r[4])];
  });
  return out;
}

function packMonthly(name){
  const {rows} = read(name);
  const out = {1: {}, 2: {}};
  rows.forEach(r => {
    const sex = r[0] === '1' ? 1 : 2;
    out[sex][Number(r[1])] = [Number(r[2]), Number(r[3]), Number(r[4])];
  });
  return out;
}

const lms = {
  // age key is days
  bfa05: packDaily('bmianthro.txt'),
  hfa05: packDaily('lenanthro.txt'),
  wfa05: packDaily('weianthro.txt'),
  // age key is completed months
  bfa07: packMonthly('bfawho2007.txt'),
  hfa07: packMonthly('hfawho2007.txt'),
  wfa07: packMonthly('wfawho2007.txt')
};

const meta = {
  bfa05: 'WHO Child Growth Standards 2006 BMI-for-age LMS, days 0–1826. File bmianthro.txt from the WHO Anthro package (https://github.com/worldhealthorganization/anthro).',
  hfa05: 'WHO Child Growth Standards 2006 length/height-for-age LMS, days 0–1826. File lenanthro.txt from the WHO Anthro package.',
  wfa05: 'WHO Child Growth Standards 2006 weight-for-age LMS, days 0–1826. File weianthro.txt from the WHO Anthro package.',
  bfa07: 'WHO Growth Reference 2007 BMI-for-age LMS, months 60–229. File bfawho2007.txt from the WHO AnthroPlus package (https://github.com/worldhealthorganization/anthroplus).',
  hfa07: 'WHO Growth Reference 2007 height-for-age LMS, months 60–229. File hfawho2007.txt from WHO AnthroPlus.',
  wfa07: 'WHO Growth Reference 2007 weight-for-age LMS, months 60–120. File wfawho2007.txt from WHO AnthroPlus. Not valid past 10 years.'
};

const body = 'globalThis.WHO_LMS=' + JSON.stringify({meta, tables: lms}) + ';\n';
fs.writeFileSync(path.join(dir, 'who-lms.js'), body);
console.log('wrote who-lms.js', body.length);

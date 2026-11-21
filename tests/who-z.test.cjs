const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {test} = require('node:test');

function load(){
  const context = {console};
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../who/who-lms.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../who/who-z.js'), 'utf8'), context);
  return context.whoZ;
}

test('length-for-age matches the WHO Anthro worked example at day 44', () => {
  const who = load();
  const z = who.indicatorZ('hfa', 1, 44, 44 / who.DAYS_PER_MONTH, 50);
  const manual = Math.round(((50 / 56.4833) ** 1 - 1) / (0.03492 * 1) * 100) / 100;
  assert.equal(manual, -3.29);
  assert.equal(z, -3.29);
});

test('weight-for-age matches the WHO Anthro result of 0.24', () => {
  const who = load();
  assert.equal(who.indicatorZ('wfa', 2, 1522, 1522 / who.DAYS_PER_MONTH, 17), 0.24);
});

test('WHO AnthroPlus published values at about 60 months', () => {
  const who = load();
  const a = who.measure({sex: 2, ageMonths: 60.32, heightCm: 113.8, weightKg: 18.7});
  assert.equal(a.waz, 0.21);
  assert.equal(a.baz, -0.58);
  assert.equal(a.haz, 0.96);
  assert.equal(a.bmiCategory, 'Normal');
  const b = who.measure({sex: 2, ageMonths: 60.911701, heightCm: 113.6, weightKg: 20.5});
  assert.equal(b.waz, 0.79);
  assert.equal(b.baz, 0.42);
  assert.equal(b.haz, 0.85);
});

test('weight-for-age stops at 10 years and BMI categories follow the age band', () => {
  const who = load();
  const older = who.measure({sex: 'Male', ageYears: 12, weightKg: 40, heightCm: 150});
  assert.equal(older.waz, null);
  assert.equal(older.wazNotApplicable, true);
  assert.equal(older.baz != null, true);
  const thin = who.measure({sex: 'Male', ageMonths: 120, weightKg: 18, heightCm: 140});
  assert.equal(thin.waz != null, true);
  assert.equal(who.bmiCategory(-3.2, 120), 'Severe thinness');
  assert.equal(who.bmiCategory(-2.4, 120), 'Thinness');
  assert.equal(who.bmiCategory(0, 120), 'Normal');
  assert.equal(who.bmiCategory(1.4, 120), 'Overweight');
  assert.equal(who.bmiCategory(2.2, 120), 'Obese');
  assert.equal(who.bmiCategory(-3.2, 40), 'Severely wasted');
  assert.equal(who.bmiCategory(1.2, 40), 'Possible risk of overweight');
  assert.equal(who.bmiCategory(3.4, 40), 'Obese');
});

test('implausible z-scores are removed rather than plotted', () => {
  const who = load();
  const row = who.measure({sex: 1, ageMonths: 80, weightKg: 10, heightCm: 80});
  assert.equal(row.bazImplausible || row.hazImplausible || row.wazImplausible, true);
  assert.equal(row.baz == null || Math.abs(row.baz) <= 5, true);
});

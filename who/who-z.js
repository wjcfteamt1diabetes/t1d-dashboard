// WHO z-scores from the LMS tables in who-lms.js.
// 0–5 years: WHO Child Growth Standards (2006), age matched to the published day.
// 5–19 years: WHO Growth Reference (2007), LMS linearly interpolated between completed months.
// Weight-based indicators (BMI-for-age, weight-for-age) use WHO's restricted SD
// adjustment outside ±3. Height-for-age does not.
// Formulae follow WHO Anthro / AnthroPlus (Chapter 7 of the WHO standards).
(function (root) {
  const DAYS_PER_MONTH = 30.4375;
  const tables = () => {
    const src = root.WHO_LMS && root.WHO_LMS.tables;
    if (!src) throw new Error('WHO LMS tables are not loaded');
    return src;
  };

  function roundHalfUp(x) {
    if (x == null || !isFinite(x)) return null;
    const base = Math.floor(x);
    return (x - base) >= 0.5 ? base + 1 : base;
  }

  function sexCode(sex) {
    const s = String(sex == null ? '' : sex).trim().toLowerCase();
    if (s === '1' || s === 'm' || s === 'male' || s === 'boy') return 1;
    if (s === '2' || s === 'f' || s === 'female' || s === 'girl') return 2;
    return null;
  }

  function zRaw(y, m, l, s) {
    if (y == null || m == null || l == null || s == null) return null;
    if (!(y > 0) || !(m > 0) || !(s > 0)) return null;
    if (l === 0) return Math.log(y / m) / s;
    return (Math.pow(y / m, l) - 1) / (l * s);
  }

  function sdValue(m, l, s, sd) {
    return m * Math.pow(1 + l * s * sd, 1 / l);
  }

  // WHO restricted application for weight-based indicators beyond ±3 SD.
  function zAdjusted(y, m, l, s) {
    const z = zRaw(y, m, l, s);
    if (z == null || !isFinite(z)) return null;
    if (z <= 3 && z >= -3) return z;
    const sd3pos = sdValue(m, l, s, 3);
    const sd3neg = sdValue(m, l, s, -3);
    const sd23pos = sd3pos - sdValue(m, l, s, 2);
    const sd23neg = sdValue(m, l, s, -2) - sd3neg;
    if (z > 3) return 3 + (y - sd3pos) / sd23pos;
    return -3 + (y - sd3neg) / sd23neg;
  }

  function round2(z) {
    if (z == null || !isFinite(z)) return null;
    return Math.round(z * 100) / 100;
  }

  function lookupDay(table, sex, ageDays) {
    const bySex = table[sex] || table[String(sex)];
    if (!bySex) return null;
    return bySex[ageDays] || null;
  }

  function lookupMonth(table, sex, month) {
    const bySex = table[sex] || table[String(sex)];
    if (!bySex) return null;
    const row = bySex[month] || bySex[String(month)];
    return row || null;
  }

  // 2007 reference: interpolate L, M, S between completed month and the next month.
  function lms2007(table, sex, ageMonths) {
    const low = Math.trunc(ageMonths);
    const diff = ageMonths - low;
    const a = lookupMonth(table, sex, low);
    if (!a) return null;
    if (!(diff > 0)) return a;
    const b = lookupMonth(table, sex, low + 1);
    if (!b) return null;
    return [
      a[0] + diff * (b[0] - a[0]),
      a[1] + diff * (b[1] - a[1]),
      a[2] + diff * (b[2] - a[2])
    ];
  }

  function fromDays(table, sex, ageDays, y, adjust) {
    const row = lookupDay(table, sex, ageDays);
    if (!row) return null;
    const z = adjust ? zAdjusted(y, row[1], row[0], row[2]) : zRaw(y, row[1], row[0], row[2]);
    return round2(z);
  }

  function fromMonths(table, sex, ageMonths, y, adjust) {
    const row = lms2007(table, sex, ageMonths);
    if (!row) return null;
    const z = adjust ? zAdjusted(y, row[1], row[0], row[2]) : zRaw(y, row[1], row[0], row[2]);
    return round2(z);
  }

  // ageDays is the WHO day index (already rounded). ageMonths is unrounded.
  function indicatorZ(kind, sex, ageDays, ageMonths, y) {
    const t = tables();
    if (sex == null || y == null || !(y > 0) || ageMonths == null || !isFinite(ageMonths) || ageMonths < 0) return null;
    if (ageMonths < 60) {
      if (ageDays == null || ageDays < 0 || ageDays > 1856) return null;
      if (kind === 'hfa') return fromDays(t.hfa05, sex, ageDays, y, false);
      if (kind === 'wfa') return fromDays(t.wfa05, sex, ageDays, y, true);
      if (kind === 'bfa') return fromDays(t.bfa05, sex, ageDays, y, true);
      return null;
    }
    if (kind === 'hfa') {
      if (ageMonths >= 229) return null;
      return fromMonths(t.hfa07, sex, ageMonths, y, false);
    }
    if (kind === 'bfa') {
      if (ageMonths >= 229) return null;
      return fromMonths(t.bfa07, sex, ageMonths, y, true);
    }
    if (kind === 'wfa') {
      // WHO AnthroPlus: weight-for-age only while age < 121 months.
      if (ageMonths >= 121) return null;
      return fromMonths(t.wfa07, sex, ageMonths, y, true);
    }
    return null;
  }

  function ageDaysFromMonths(ageMonths) {
    if (ageMonths == null || !isFinite(ageMonths)) return null;
    return roundHalfUp(ageMonths * DAYS_PER_MONTH);
  }

  // Standing height is what this sheet stores. Under 731 days WHO expects
  // length, so 0.7 cm is added. From 731 days the height tables apply as-is.
  function heightForStandard(ageDays, heightCm) {
    if (heightCm == null || !(heightCm > 0) || ageDays == null) return null;
    if (ageDays < 731) return heightCm + 0.7;
    return heightCm;
  }

  function bmiOf(weightKg, heightCm) {
    if (weightKg == null || heightCm == null || !(weightKg > 0) || !(heightCm > 0)) return null;
    const metres = heightCm / 100;
    return weightKg / (metres * metres);
  }

  function flagBmi(z) {
    return z != null && Math.abs(z) > 5;
  }
  function flagHaz(z) {
    return z != null && (z < -6 || z > 6);
  }
  function flagWaz(z) {
    return z != null && (z < -6 || z > 5);
  }

  // WHO BMI-for-age category. Under 5 years the labels are the 2006 wasting
  // labels; from 5 years they are the 2007 thinness labels. Cut-offs differ.
  function bmiCategory(z, ageMonths) {
    if (z == null || ageMonths == null) return '';
    if (ageMonths < 60) {
      if (z < -3) return 'Severely wasted';
      if (z < -2) return 'Wasted';
      if (z <= 1) return 'Normal';
      if (z <= 2) return 'Possible risk of overweight';
      if (z <= 3) return 'Overweight';
      return 'Obese';
    }
    if (z < -3) return 'Severe thinness';
    if (z < -2) return 'Thinness';
    if (z <= 1) return 'Normal';
    if (z <= 2) return 'Overweight';
    return 'Obese';
  }

  function wazCategory(z) {
    if (z == null) return '';
    if (z < -3) return 'Severe underweight';
    if (z < -2) return 'Underweight';
    if (z <= 1) return 'Normal';
    if (z <= 2) return 'Possible risk of overweight';
    return 'Above +2';
  }

  function measure(input) {
    const sex = sexCode(input && input.sex);
    const ageYears = input && input.ageYears;
    const ageMonths = input && input.ageMonths != null ? input.ageMonths : (ageYears == null ? null : ageYears * 12);
    const ageDays = input && input.ageDays != null ? roundHalfUp(input.ageDays) : ageDaysFromMonths(ageMonths);
    const heightIn = input && input.heightCm;
    const weight = input && input.weightKg;
    const height = heightForStandard(ageDays, heightIn);
    const bmi = bmiOf(weight, height);
    const wazApplicable = ageMonths != null && ageMonths >= 0 && ageMonths < 121;
    let baz = indicatorZ('bfa', sex, ageDays, ageMonths, bmi);
    let haz = indicatorZ('hfa', sex, ageDays, ageMonths, height);
    let waz = wazApplicable ? indicatorZ('wfa', sex, ageDays, ageMonths, weight) : null;
    const bazFlag = flagBmi(baz);
    const hazFlag = flagHaz(haz);
    const wazFlag = flagWaz(waz);
    if (bazFlag) baz = null;
    if (hazFlag) haz = null;
    if (wazFlag) waz = null;
    return {
      sex, ageMonths, ageDays, heightCm: height, weightKg: weight, bmi,
      baz, haz, waz,
      bazImplausible: bazFlag, hazImplausible: hazFlag, wazImplausible: wazFlag,
      wazApplicable,
      wazNotApplicable: ageMonths != null && ageMonths >= 121,
      bmiCategory: bmiCategory(baz, ageMonths),
      wazCategory: waz == null ? '' : wazCategory(waz),
      stunted: haz != null && haz < -2,
      severelyStunted: haz != null && haz < -3
    };
  }

  root.whoZ = {
    roundHalfUp, sexCode, zRaw, zAdjusted, indicatorZ, measure,
    bmiCategory, wazCategory, ageDaysFromMonths, heightForStandard, bmiOf,
    DAYS_PER_MONTH
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

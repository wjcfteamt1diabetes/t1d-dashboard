# Growth monitoring methods

The growth charts read `Growth_child` and `Growth_milestones` from the programme workbook. They do not use placeholder values. Where a WHO z-score cannot be computed from the columns we have, the chart says so.

## Reference data

The LMS tables are the files published with the WHO software, copied into `who/source/`:

- WHO Child Growth Standards (2006), birth to 5 years, from the [WHO Anthro](https://github.com/worldhealthorganization/anthro) package: `bmianthro.txt`, `lenanthro.txt`, `weianthro.txt`. These are the length/height-for-age, BMI-for-age and weight-for-age tables. Age in those files is in days.
- WHO Growth Reference (2007), 5–19 years, from the [WHO AnthroPlus](https://github.com/worldhealthorganization/anthroplus) package: `bfawho2007.txt`, `hfawho2007.txt`, `wfawho2007.txt`. Age in those files is in completed months. Weight-for-age stops at 120 months.

`who/build-lms.mjs` turns those files into `who/who-lms.js`. The z-score code is `who/who-z.js`.

## Age, sex and the z-score

Sex is male = 1 and female = 2. The sheet stores age in decimal years. Age in months is `age in years × 12`. For the 2006 standards, age in days is that month value times 30.4375, rounded half up, which is the WHO Anthro day length. The sheet does not include a date of birth, so the z-score uses this age rather than an exact day count.

BMI is weight in kilograms divided by height in metres squared. Below 731 days, the stored height is treated as standing height and 0.7 cm is added so it can be compared with the WHO length standard. From 731 days the height is used as recorded.

The z-score is `((X / M) ^ L − 1) / (L × S)`. If L is 0 it is `ln(X / M) / S`. For BMI-for-age and weight-for-age, a raw z outside ±3 is replaced with the WHO restricted adjustment: the distance beyond the ±3 SD value is divided by the gap between the 2 SD and 3 SD values. Height-for-age is not adjusted that way. Results are rounded to two decimal places, as in the WHO programs.

A z-score is dropped as biologically implausible when BMI-for-age is outside ±5, height-for-age is below −6 or above +6, or weight-for-age is below −6 or above +5. The chart footnotes count those exclusions.

## Cut-offs

From 5 years (60 months) to under 19 years, BMI-for-age uses the WHO 2007 labels: severe thinness below −3, thinness from −3 up to but not including −2, normal from −2 to +1 inclusive, overweight above +1 up to +2 inclusive, obese above +2.

Under 5 years the WHO 2006 labels are used instead: severely wasted below −3, wasted from −3 up to but not including −2, normal from −2 to +1 inclusive, possible risk of overweight above +1 up to +2 inclusive, overweight above +2 up to +3 inclusive, obese above +3. Those labels are not mixed into the 5–19 charts.

Height-for-age below −2 is stunted and below −3 is severely stunted. Weight-for-age below −2 is underweight and below −3 is severe underweight. Weight-for-age is only calculated while age is under 121 months (10 years, the WHO AnthroPlus limit). At 121 months or older the child is counted as “WAZ not applicable (>10 y)” and is not given an extrapolated z-score.

The healthy average drawn on the trend is z = 0, the WHO median for the same age and sex.

## One child, one place in a chart

The extract has one baseline measurement and one latest measurement per child, not every visit. Baseline is that stored baseline pair. Latest is that stored latest pair. A child is counted once.

For change over time, both measurements must be valid and the gap from baseline age to latest age must be at least 3 months. Time in care is that gap, in bands that do not overlap: under 6 months, 6 up to 12, 12 up to 18, and 18 months or more. Change in kilograms per year is the kilogram change divided by the gap in years. Change in weight-for-age z is reported only when both measurements are under 10 years.

## What cannot be recomputed

`Growth_milestones` stores a mean BMI-for-age z and a mean height-for-age z at each month since enrolment. It does not store the weight, height and age of each visit. The month-on-month lines are those stored means. They are not recalculated from the LMS tables. The page reports how often the baseline and latest z-scores recomputed here fall within 0.15 of the stored scores, so the reader can see whether the sheet used the same reference.

The sheet’s older change labels (Faltering, Watch, Stable, Healthy shift, Excess gain) are not WHO cut-offs. The charts no longer use those labels for the BMI-for-age display. They remain on the sheet.

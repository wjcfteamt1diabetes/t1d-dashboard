# Growth monitoring methods

The growth charts read `Growth_child` from the programme workbook. Children are those enrolled in the 2–18 growth cohort. Latest age can be older than 18 and younger than 19; the page heading shows the latest-age range in the current filter. They do not use placeholder values. Z-scores are calculated on the page from weight, height, age and sex. Where a z-score cannot be computed, the chart says who is left out.

## Reference data

The LMS tables are the files published with the WHO software, copied into `who/source/`:

- WHO Child Growth Standards (2006), birth to 5 years, from the [WHO Anthro](https://github.com/worldhealthorganization/anthro) package: `bmianthro.txt`, `lenanthro.txt`, `weianthro.txt`. Age in those files is in days.
- WHO Growth Reference (2007), 5–19 years, from the [WHO AnthroPlus](https://github.com/worldhealthorganization/anthroplus) package: `bfawho2007.txt`, `hfawho2007.txt`, `wfawho2007.txt`. Age in those files is in completed months. Weight-for-age stops at 120 months.

`who/build-lms.mjs` turns those files into `who/who-lms.js`. The z-score code is `who/who-z.js`. That code is unchanged.

## Age, sex and the z-score

Sex is male = 1 and female = 2. The sheet stores age in decimal years. Age in months is `age in years × 12`. For the 2006 standards, age in days is that month value times 30.4375, rounded half up. The sheet does not include a date of birth, so the z-score uses this age rather than an exact day count.

BMI is weight in kilograms divided by height in metres squared. Below 731 days, the stored height is treated as standing height and 0.7 cm is added so it can be compared with the WHO length standard. From 731 days the height is used as recorded.

The z-score is `((X / M) ^ L − 1) / (L × S)`. If L is 0 it is `ln(X / M) / S`. For BMI-for-age and weight-for-age, a raw z outside ±3 is replaced with the WHO restricted adjustment. Height-for-age is not adjusted that way. Results are rounded to two decimal places.

A z-score is dropped as biologically implausible when BMI-for-age is outside ±5, height-for-age is below −6 or above +6, or weight-for-age is below −6 or above +5. The footnotes count those exclusions.

## What the charts count

The charts do not plot the mean z-score. They count children:

- Thin: BMI-for-age z below −2. From age 5 this is WHO thinness (including severe thinness). Under 5, WHO calls the same cut wasted (including severely wasted).
- Healthy: BMI-for-age z from −2 to +1, inclusive.
- Overweight: BMI-for-age z above +1. From age 5 this includes obese. Under 5, WHO calls +1 to +2 possible risk of overweight, and higher values overweight or obese. All of those sit in this one group.
- Stunted: height-for-age z below −2.
- Underweight: weight-for-age z below −2. Weight-for-age is calculated only while age is under 121 months (through 120 months). At 121 months or older the child is counted as not applicable and is not given an extrapolated z-score.

Under 5 and ages 5–19 are in the same three BMI groups. The note on the page says how the WHO names differ.

## One child, one place

The extract has one baseline measurement and one latest measurement per child. A child is counted once.

For a before-and-after chart, both measurements must be valid and the gap from baseline age to latest age must be at least 3 months. Time in care is that gap, in bands that do not overlap: 3–6 months, 6 up to 12, 12 up to 18, and 18 months or more. A band with fewer than 20 children is hidden.

“Kept pace” on the weight-gain chart means the weight-for-age z changed by no more than 0.5. That is growing at about the normal WHO rate for the child’s age. Fell behind is a drop of more than 0.5. Gained faster is a rise of more than 0.5. Kilograms per year are the kilogram change divided by the gap in years, and they appear only in the tooltip.

`Growth_visits_dash` and `Growth_milestones` are not loaded. The month-on-month mean z chart was removed, and every remaining view uses the baseline and latest pair on `Growth_child`.

## Filters

Every growth chart uses the same children. State, division, district, facility, DPC, support, sex, age group and status restrict that list before the chart is drawn. Division and DPC come from the facility lookup on the patient. Light support has no patient-level rows, so the growth section is empty. Adults hide the section. The enrolment period, including a custom from–to range, uses `Enrolment_date`. A child with no enrolment date is left out of a dated period. A short note is hidden when the chart’s n is under 20. When one state is selected, the place chart shows that state’s districts with at least 20 children.

## Change log

- Replaced the mean z-score charts with shares a program manager can read: thin, stunted, overweight and underweight.
- Baseline versus latest BMI is the same children, overall and by time in care (3–6, 6–12, 12–18, 18+ months).
- Underweight is the same children, both visits through 120 months.
- Weight gain is whether the weight-for-age z fell, held, or rose, not the raw kilogram change. Kilograms per year stay in the tooltip.
- State comparison switches to districts when a state is selected.
- Latest HbA1c is three bars (thin, in range, overweight) with a line at 8.5%.
- Removed the month-on-month line chart and stopped loading `Growth_visits_dash` and `Growth_milestones`.

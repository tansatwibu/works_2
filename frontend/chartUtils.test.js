import test from 'node:test';
import assert from 'node:assert/strict';

import { aggregateByPeriod, resolveChartData, getPeriodLabel } from './chartUtils.js';

test('aggregateByPeriod groups daily records into month buckets', () => {
  const rows = [
    { date: '2024-01-05', opened: 2, closed: 1 },
    { date: '2024-01-20', opened: 3, closed: 2 },
    { date: '2024-02-03', opened: 4, closed: 5 },
  ];

  const result = aggregateByPeriod(rows, 'month');
  assert.deepEqual(result, [
    { date: '2024-01', opened: 5, closed: 3 },
    { date: '2024-02', opened: 4, closed: 5 },
  ]);
});

test('resolveChartData keeps daily data for day mode and aggregates for other modes', () => {
  const rows = [
    { date: '2024-01-05', opened: 2, closed: 1 },
    { date: '2024-02-03', opened: 4, closed: 5 },
  ];

  assert.deepEqual(resolveChartData(rows, 'day'), rows);
  assert.deepEqual(resolveChartData(rows, 'month'), [
    { date: '2024-01', opened: 2, closed: 1 },
    { date: '2024-02', opened: 4, closed: 5 },
  ]);
});

test('getPeriodLabel returns the display text for each time unit', () => {
  assert.equal(getPeriodLabel('day'), 'THEO NGÀY');
  assert.equal(getPeriodLabel('month'), 'THEO THÁNG');
  assert.equal(getPeriodLabel('year'), 'THEO NĂM');
});

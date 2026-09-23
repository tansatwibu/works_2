import test from 'node:test';
import assert from 'node:assert/strict';

process.env.TZ = 'Asia/Ho_Chi_Minh';

import { aggregateByPeriod, resolveChartData, getPeriodLabel, getMonthRange } from './chartUtils.js';

test('aggregateByPeriod groups daily records into month buckets', () => {
  const rows = [
    { date: '2024-01-05', count: 20, delta: 2 },
    { date: '2024-01-20', count: 23, delta: 3 },
    { date: '2024-02-03', count: 25, delta: 2 },
  ];

  const result = aggregateByPeriod(rows, 'month');
  assert.deepEqual(result, [
    { date: '2024-01', count: 23, delta: 3 },
    { date: '2024-02', count: 25, delta: 2 },
  ]);
});

test('resolveChartData keeps daily data for day mode and aggregates for other modes', () => {
  const rows = [
    { date: '2024-01-05', count: 20, delta: 2 },
    { date: '2024-02-03', count: 25, delta: 5 },
  ];

  assert.deepEqual(resolveChartData(rows, 'day'), rows);
  assert.deepEqual(resolveChartData(rows, 'month'), [
    { date: '2024-01', count: 20, delta: 2 },
    { date: '2024-02', count: 25, delta: 5 },
  ]);
});

test('getMonthRange converts a month input into an inclusive month range', () => {
  assert.deepEqual(getMonthRange('2024-02'), { from: '2024-02-01', to: '2024-03-01' });
  assert.deepEqual(getMonthRange('2024-12'), { from: '2024-12-01', to: '2025-01-01' });
  assert.deepEqual(getMonthRange('2026-09'), { from: '2026-09-01', to: '2026-10-01' });
});

test('getPeriodLabel returns the display text for each time unit', () => {
  assert.equal(getPeriodLabel('day'), 'THEO NGÀY');
  assert.equal(getPeriodLabel('month'), 'THEO THÁNG');
  assert.equal(getPeriodLabel('year'), 'THEO NĂM');
});

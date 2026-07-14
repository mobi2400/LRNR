import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/server/metrics.ts');

type MetricLabels = Record<string, string | number | boolean>;

export interface CounterSnapshot {
  name: string;
  labels: MetricLabels;
  value: number;
}

export interface HistogramSnapshot {
  name: string;
  labels: MetricLabels;
  count: number;
  sum: number;
  min: number;
  max: number;
}

const counters = new Map<string, CounterSnapshot>();
const histograms = new Map<string, HistogramSnapshot>();

function normalizeLabels(labels: MetricLabels = {}): MetricLabels {
  return Object.fromEntries(
    Object.entries(labels)
      .filter(([, value]) => value !== undefined)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function metricKey(name: string, labels: MetricLabels): string {
  return `${name}:${JSON.stringify(normalizeLabels(labels))}`;
}

export function incrementMetric(
  name: string,
  labels: MetricLabels = {},
  amount = 1,
): void {
  const normalized = normalizeLabels(labels);
  const key = metricKey(name, normalized);
  const current = counters.get(key);

  counters.set(key, {
    name,
    labels: normalized,
    value: (current?.value ?? 0) + amount,
  });
}

export function observeMetric(
  name: string,
  value: number,
  labels: MetricLabels = {},
): void {
  const normalized = normalizeLabels(labels);
  const key = metricKey(name, normalized);
  const current = histograms.get(key);

  histograms.set(key, {
    name,
    labels: normalized,
    count: (current?.count ?? 0) + 1,
    sum: (current?.sum ?? 0) + value,
    min: current === undefined ? value : Math.min(current.min, value),
    max: current === undefined ? value : Math.max(current.max, value),
  });
}

export function observeDurationMs<T>(
  name: string,
  labels: MetricLabels,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();

  return operation().finally(() => {
    observeMetric(name, performance.now() - startedAt, labels);
  });
}

export function getMetricsSnapshot(): {
  counters: CounterSnapshot[];
  histograms: HistogramSnapshot[];
} {
  return {
    counters: [...counters.values()],
    histograms: [...histograms.values()],
  };
}

export function resetMetricsForTests(): void {
  counters.clear();
  histograms.clear();
}

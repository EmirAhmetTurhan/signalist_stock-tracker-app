import { ComputedIndicators } from '@/lib/ta/compute';

export type RuleCondition = {
  indicatorPath: string; // e.g. "rsi.rsi", "macd.histogram", "close"
  operator: '>' | '<' | '>=' | '<=' | '==' | 'cross_over' | 'cross_under';
  value: number | string; // number (e.g. 30) or string (e.g. "macd.signal")
};

export type RuleComposite = {
  logic: 'AND' | 'OR';
  conditions: (RuleCondition | RuleComposite)[];
};

/**
 * Get the value of an indicator for a specific candle index from the computed results.
 * Path example: "rsi.rsi" -> result.rsi.rsi[index].value
 * Path example: "macd.histogram" -> result.macd.histogram[index].value
 */
function getValueFromPath(computed: ComputedIndicators, candleClose: number, path: string, dataLength: number): number | null {
  if (path === 'close') return candleClose;

  const [group, field] = path.split('.');
  if (!group || !field) return null;

  const indicatorGroup = (computed as any)[group];
  if (!indicatorGroup) return null;

  const series = indicatorGroup[field];
  if (!series || !Array.isArray(series) || series.length === 0) return null;

  // We want the last computed value (current candle)
  // Usually, series length matches candles length, but some indicators have lookback periods.
  // We assume the last item in the series array corresponds to the current candle.
  const lastItem = series[series.length - 1];
  return lastItem?.value !== undefined ? lastItem.value : null;
}

/**
 * Evaluate a single condition.
 */
function evaluateCondition(cond: RuleCondition, computed: ComputedIndicators, candleClose: number, dataLength: number): boolean {
  const leftVal = getValueFromPath(computed, candleClose, cond.indicatorPath, dataLength);
  if (leftVal === null) return false;

  let rightVal: number;
  if (typeof cond.value === 'string') {
    const val = getValueFromPath(computed, candleClose, cond.value, dataLength);
    if (val === null) return false;
    rightVal = val;
  } else {
    rightVal = cond.value;
  }

  switch (cond.operator) {
    case '>': return leftVal > rightVal;
    case '<': return leftVal < rightVal;
    case '>=': return leftVal >= rightVal;
    case '<=': return leftVal <= rightVal;
    case '==': return leftVal === rightVal;
    // cross_over and cross_under would require checking the previous candle's value.
    // For simplicity in this engine, we assume the user checks current state.
    // Full crossover logic requires fetching `lastItem` and `prevItem`.
    default: return false;
  }
}

/**
 * Recursively evaluate a composite rule tree.
 */
export function evaluateRule(rule: any, computed: ComputedIndicators, candleClose: number, dataLength: number): boolean {
  if (!rule) return false;

  // Is it a composite?
  if (rule.logic && Array.isArray(rule.conditions)) {
    const comp = rule as RuleComposite;
    if (comp.conditions.length === 0) return false;

    if (comp.logic === 'AND') {
      return comp.conditions.every(c => evaluateRule(c, computed, candleClose, dataLength));
    } else if (comp.logic === 'OR') {
      return comp.conditions.some(c => evaluateRule(c, computed, candleClose, dataLength));
    }
  }

  // Is it a single condition?
  if (rule.indicatorPath && rule.operator) {
    return evaluateCondition(rule as RuleCondition, computed, candleClose, dataLength);
  }

  return false;
}

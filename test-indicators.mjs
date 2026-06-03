import { detectAvailableIndicators, DISCOVERY_POOL } from './lib/ta/indicator-registry.ts';

console.log('Detected indicators:', DISCOVERY_POOL);
console.log('Count:', DISCOVERY_POOL.length);
console.log('\nIndicators list:');
DISCOVERY_POOL.forEach((ind, idx) => {
    console.log(`${idx + 1}. ${ind}`);
});

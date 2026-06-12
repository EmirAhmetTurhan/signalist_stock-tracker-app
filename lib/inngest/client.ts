import { Inngest } from 'inngest';

export type SimulationRunStartedPayload = {
  data: {
    simulationId: string;
    userId: string;
    walletId: string;
    strategyPortfolio: any[];
    startDate: string; // ISO String via API
    endDate: string;
    positionSizingConfig: any;
    benchmarkSymbol: string;
  };
};

type Events = {
  'simulation/run.started': SimulationRunStartedPayload;
  'paper-trading/daily-execution': {
    data: Record<string, never>;
  };
};

export const inngest = new Inngest({
  id: 'signalist-stock-tracker',
  eventKey: process.env.INNGEST_EVENT_KEY,
});
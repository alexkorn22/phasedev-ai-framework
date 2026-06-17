export interface FlushableReporter {
  log(message: string): void;
  flush?(): Promise<void>;
}

export function createCompositeReporter(reporters: FlushableReporter[]): Required<FlushableReporter> {
  return {
    log(message: string): void {
      for (const reporter of reporters) {
        reporter.log(message);
      }
    },
    async flush(): Promise<void> {
      for (const reporter of reporters) {
        if (reporter.flush) {
          await reporter.flush();
        }
      }
    }
  };
}

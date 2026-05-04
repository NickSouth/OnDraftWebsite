export interface ILoggingService {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

class LoggingService implements ILoggingService {
  private stamp(level: string, message: string): string {
    return `${new Date().toISOString()} [${level}] ${message}`;
  }

  info(message: string): void {
    console.log(this.stamp("INFO", message));
  }

  warn(message: string): void {
    console.warn(this.stamp("WARN", message));
  }

  error(message: string): void {
    console.error(this.stamp("ERROR", message));
  }
}

let loggingServiceInstance: ILoggingService | null = null;

export function CreateLoggingService(): ILoggingService {
  if (loggingServiceInstance === null) {
    loggingServiceInstance = new LoggingService();
  }
  return loggingServiceInstance;
}

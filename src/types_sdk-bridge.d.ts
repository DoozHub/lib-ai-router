declare module "@doozhub/sdk-bridge" {
  export interface BridgeConfig {
    bridgeUrl: string;
    appId: string;
    logLevel?: string;
  }

  export interface BridgeEvent {
    topic: string;
    payload: Record<string, unknown>;
    correlationId?: string;
    timestamp?: string;
  }

  export type BridgeEventHandler = (event: BridgeEvent) => void | Promise<void>;

  export class BridgeClient {
    constructor(config: BridgeConfig);
    publish(topic: string, payload: Record<string, unknown>, correlationId?: string): Promise<void>;
    subscribe(topicPattern: string): Promise<void>;
    on(topicPattern: string, handler: BridgeEventHandler): () => void;
    startPolling(): void;
    stopPolling(): void;
  }

  export const Topics: Record<string, string>;
  export type TopicName = string;
}

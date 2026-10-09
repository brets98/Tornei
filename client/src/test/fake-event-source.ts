/** Stand-in for the browser's EventSource (missing in jsdom) that tests can drive. */
export class FakeEventSource {
  static instances: FakeEventSource[] = [];

  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  /** Simulates the server pushing `data`. */
  emit(data: unknown) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }));
  }

  /** Simulates a dropped connection. */
  fail() {
    this.onerror?.();
  }

  close() {
    this.closed = true;
  }

  static latest() {
    return FakeEventSource.instances.at(-1)!;
  }

  static reset() {
    FakeEventSource.instances = [];
  }
}

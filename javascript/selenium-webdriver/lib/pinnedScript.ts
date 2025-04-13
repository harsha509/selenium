import crypto from 'node:crypto';

export class PinnedScript {
  private scriptSource_: string;
  private scriptHandle_: string;
  private scriptId_?: string;

  constructor(script: string) {
    this.scriptSource_ = script;
    this.scriptHandle_ = crypto.randomUUID().replace(/-/gi, '');
  }

  get handle(): string {
    return this.scriptHandle_;
  }

  get source(): string {
    return this.scriptSource_;
  }

  get scriptId(): string | undefined {
    return this.scriptId_;
  }

  set scriptId(id: string | undefined) {
    this.scriptId_ = id;
  }

  creationScript(): string {
    return `function __webdriver_${this.scriptHandle_}(arguments) { ${this.scriptSource_} }`;
  }

  executionScript(): string {
    return `return __webdriver_${this.scriptHandle_}(arguments)`;
  }

  removalScript(): string {
    return `__webdriver_${this.scriptHandle_} = undefined`;
  }
}

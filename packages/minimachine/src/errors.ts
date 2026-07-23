export class MinimachineError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(opts: { status: number; code: string; message: string }) {
    super(opts.message);
    this.name = "MinimachineError";
    this.status = opts.status;
    this.code = opts.code;
  }
}

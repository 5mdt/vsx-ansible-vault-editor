// #AVE-0005, #AVE-0006: error types shared across layers.

/** The command does not apply here; the message is shown to the user as is. */
// #AVE-0005, #AVE-0006
export class RefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RefusedError";
  }
}

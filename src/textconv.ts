// #AVE-0015: entry point of build/textconv.js, run by git as a textconv driver.

import { runTextconv } from "./diff/textconv";

runTextconv(process.argv.slice(2), {
  env: process.env,
  cwd: process.cwd(),
  write: (t) => void process.stdout.write(t),
}).catch(() => {
  // git must still get a diff; a driver failure would abort it
});

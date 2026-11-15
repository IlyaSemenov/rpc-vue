/**
 * Run an error reporting hook so that neither its synchronous throw nor its rejection replaces
 * the reported operation's error; hook failures are logged under the hook's option name.
 */
export function runErrorHook(name: string, run: () => void | Promise<void>) {
  try {
    void Promise.resolve(run()).catch((error: unknown) => logHookError(name, error))
  } catch (error) {
    logHookError(name, error)
  }
}

function logHookError(name: string, error: unknown) {
  console.error(`orpc-vue: ${name} failed`, error)
}

/* Dev-only logger: debug output is stripped from release builds. */
export const logger = {
  debug: (...args: unknown[]): void => {
    if (__DEV__) {
      console.log(...args);
    }
  },
};

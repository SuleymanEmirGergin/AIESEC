/**
 * Simple debounce function to delay execution of a function until after 
 * a specified wait time has elapsed since the last time it was invoked.
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number = 600
): (...args: Parameters<T>) => void {
  let timeout: any = null;

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  };
}

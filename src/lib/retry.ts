/**
 * Utility for retrying a function with exponential backoff.
 * 
 * @param fn The function to retry
 * @param maxAttempts Maximum number of attempts (default 3)
 * @param baseDelay Base delay in ms (default 1000)
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Only retry on network errors or 5xx status codes
      // Note: We don't retry on 429 as it typically requires longer wait times
      // handled by the circuit breaker or specific logic.
      const isNetworkError = error.message?.includes("NetworkError") || 
                            error.message?.includes("Failed to fetch") ||
                            error.name === "TypeError";
      
      if (!isNetworkError && attempt < maxAttempts) {
        throw error; // Re-throw if it's not a transient network error
      }

      if (attempt === maxAttempts) break;

      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 100;
      console.warn(`Attempt ${attempt} failed. Retrying in ${Math.round(delay)}ms...`, error);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

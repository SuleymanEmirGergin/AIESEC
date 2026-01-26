/**
 * Circuit Breaker implementation for Overpass API.
 * 
 * Rules:
 * - 5 consecutive failures -> OPEN
 * - OPEN state duration -> 60s
 * - While OPEN, only serve from cache (if available) or return warning.
 */

interface CircuitState {
  failureCount: number;
  lastFailureTime: number | null;
  isOpen: boolean;
}

const state: CircuitState = {
  failureCount: 0,
  lastFailureTime: null,
  isOpen: false,
};

const FAILURE_THRESHOLD = 5;
const COOLDOWN_MS = 60 * 1000; // 60 seconds

export const circuitBreaker = {
  /**
   * Checks if the circuit is currently open (blocked).
   * Automatically heals if cooldown has passed.
   */
  isOpen(): boolean {
    if (state.isOpen && state.lastFailureTime) {
      const timeSinceLastFailure = Date.now() - state.lastFailureTime;
      if (timeSinceLastFailure > COOLDOWN_MS) {
        this.reset();
        return false;
      }
      return true;
    }
    return false;
  },

  /**
   * Registers a failure. Opens circuit if threshold reached.
   */
  recordFailure(): void {
    state.failureCount += 1;
    state.lastFailureTime = Date.now();
    
    if (state.failureCount >= FAILURE_THRESHOLD) {
      console.error(`[CIRCUIT BREAKER] Threshold reached (${FAILURE_THRESHOLD}). Opening circuit.`);
      state.isOpen = true;
    }
  },

  /**
   * Registers a success. Resets the failure counter.
   */
  recordSuccess(): void {
    if (!state.isOpen) {
      state.failureCount = 0;
    }
  },

  /**
   * Resets the circuit state.
   */
  reset(): void {
    console.log("[CIRCUIT BREAKER] Resetting circuit to CLOSED.");
    state.failureCount = 0;
    state.lastFailureTime = null;
    state.isOpen = false;
  }
};

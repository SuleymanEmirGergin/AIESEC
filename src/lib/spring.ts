/**
 * Kesintiye ugratilabilir yay (spring) animasyonu.
 *
 * Sabit sureli animasyonlardan farki: hedef her an degistirilebilir ve hareket
 * mevcut konum + mevcut HIZ uzerinden devam eder. Ucus ortasinda yeni bir hedef
 * verilince siçrama ya da hiz kopmasi olmaz.
 *
 * Eksenler bagimsiz cozulur; tek bir 2B mesafeye yay takmak, eksenlerin hizlari
 * farkli oldugunda hareketi senkronsuz gosterir.
 */

export interface SpringOptions {
  /** 1 = kritik sonumlu (salinim yok). <1 hedefi asar ve seker. */
  damping?: number;
  /** Hedefe varis hizi, saniye. Sure DEGIL - yayin sure kavrami yoktur. */
  response?: number;
  /** Eksen basina "yerine oturdu" esigi. */
  precision: number[];
}

export interface SpringGroup {
  setTarget(next: number[]): void;
  /** Yay bosta iken canli degerlerle yeniden esitler. */
  reset(next: number[]): void;
  stop(): void;
  readonly running: boolean;
}

const MAX_FRAME_SECONDS = 0.064;
const SUBSTEP_SECONDS = 1 / 240;

export function createSpringGroup(
  initial: number[],
  onFrame: (values: number[], settled: boolean) => void,
  { damping = 1, response = 0.4, precision }: SpringOptions,
): SpringGroup {
  const omega = (2 * Math.PI) / response;
  const stiffness = omega * omega;
  const dampingCoefficient = 2 * damping * omega;

  let values = [...initial];
  let targets = [...initial];
  let velocities = initial.map(() => 0);
  let rafId = 0;
  let lastTime = 0;

  const settled = () =>
    values.every(
      (value, i) =>
        Math.abs(targets[i] - value) < precision[i] &&
        Math.abs(velocities[i]) < precision[i],
    );

  const frame = (now: number) => {
    const elapsed = Math.min((now - lastTime) / 1000, MAX_FRAME_SECONDS);
    lastTime = now;

    const substeps = Math.max(1, Math.ceil(elapsed / SUBSTEP_SECONDS));
    const h = elapsed / substeps;

    for (let step = 0; step < substeps; step++) {
      for (let i = 0; i < values.length; i++) {
        const acceleration =
          stiffness * (targets[i] - values[i]) - dampingCoefficient * velocities[i];
        velocities[i] += acceleration * h;
        values[i] += velocities[i] * h;
      }
    }

    if (settled()) {
      values = [...targets];
      velocities = velocities.map(() => 0);
      rafId = 0;
      onFrame(values, true);
      return;
    }

    onFrame(values, false);
    rafId = requestAnimationFrame(frame);
  };

  return {
    setTarget(next: number[]) {
      targets = [...next];
      if (rafId === 0 && !settled()) {
        lastTime = performance.now();
        rafId = requestAnimationFrame(frame);
      }
    },
    reset(next: number[]) {
      values = [...next];
      targets = [...next];
      velocities = velocities.map(() => 0);
    },
    stop() {
      if (rafId !== 0) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      velocities = velocities.map(() => 0);
      targets = [...values];
    },
    get running() {
      return rafId !== 0;
    },
  };
}

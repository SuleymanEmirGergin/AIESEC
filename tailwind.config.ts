import type { Config } from "tailwindcss";

/**
 * Hallmark · theme: Cobalt · genre: modern-minimal
 *
 * Renkler burada ham deger olarak degil, `src/app/tokens.css` icindeki
 * degiskenlere referansla tanimli. Tek kaynak orasi; paleti degistirmek
 * icin bu dosyaya dokunmak gerekmiyor.
 *
 * `darkMode: "class"` bilerek duruyor. Projede `dark` sinifini ekleyen
 * hicbir kod yok, yani mevcut `dark:` varyantlari etkisiz. Bu satiri
 * silmek Tailwind'i varsayilan `media` stratejisine dusururdu ve
 * isletim sistemi koyu temada olan kullanicilarda o olu varyantlar
 * aniden devreye girip arayuzu yarim koyu gosterirdi.
 */
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: "var(--color-paper)",
          2: "var(--color-paper-2)",
          3: "var(--color-paper-3)",
        },
        ink: {
          DEFAULT: "var(--color-ink)",
          2: "var(--color-ink-2)",
          3: "var(--color-ink-3)",
          4: "var(--color-ink-4)",
        },
        rule: {
          DEFAULT: "var(--color-rule)",
          2: "var(--color-rule-2)",
        },
        accent: {
          DEFAULT: "var(--color-accent)",
          hover: "var(--color-accent-hover)",
          ink: "var(--color-accent-ink)",
          wash: "var(--color-accent-wash)",
          edge: "var(--color-accent-edge)",
        },
        graphite: {
          DEFAULT: "var(--color-graphite)",
          2: "var(--color-graphite-2)",
          ink: "var(--color-graphite-ink)",
          "ink-2": "var(--color-graphite-ink-2)",
        },
        positive: "var(--color-positive)",
        caution: {
          DEFAULT: "var(--color-caution)",
          bg: "var(--color-caution-bg)",
          /** Grafit bant uzerinde; acik zemin tonu orada okunmuyor. */
          "on-dark": "var(--color-caution-on-dark)",
        },
        critical: "var(--color-critical)",
        scrim: "var(--color-scrim)",

        /**
         * Geriye donuk takma ad. Eski bilesenlerde `bg-primary` /
         * `text-primary` gecen yerler kaldiysa sistemin aksan rengine
         * dussun; Tailwind bilinmeyen sinifi sessizce atiyor ve o oge
         * hicbir uyari vermeden stilsiz kaliyor.
         */
        primary: "var(--color-accent)",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
        mono: ["var(--font-mono)"],
        /** Eski `font-heading` kullanimlari display'e dussun. */
        heading: ["var(--font-display)"],
      },
      fontSize: {
        "2xs": "var(--text-2xs)",
      },
      borderRadius: {
        chip: "var(--radius-chip)",
        input: "var(--radius-input)",
        card: "var(--radius-card)",
      },
      transitionTimingFunction: {
        out: "var(--ease-out)",
        in: "var(--ease-in)",
        "in-out": "var(--ease-in-out)",
      },
      transitionDuration: {
        fast: "var(--dur-fast)",
        short: "var(--dur-short)",
        mid: "var(--dur-mid)",
      },
      boxShadow: {
        lift: "var(--shadow-lift)",
        modal: "var(--shadow-modal)",
      },
    },
  },
  plugins: [],
};

export default config;

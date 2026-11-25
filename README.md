[![news-image-20261125](https://make.fun/badge/news-image-20261125.svg)](https://make.fun/bounty/news-image-20261125)
[![rank](https://make.fun/badge/news-image-20261125/kuro1996/news-image-20261125/rank.svg)](https://make.fun/bounty/news-image-20261125)
[![reward](https://make.fun/badge/news-image-20261125/kuro1996/news-image-20261125/reward.svg)](https://make.fun/bounty/news-image-20261125)

# News Image — 25 November 2026

**Competition:** [news-image-20261125](https://make.fun/bounty/news-image-20261125) — *Sum up 25 November's world news in one image* ($100, 50 places paid).

## The image

An editorial newspaper front page, **"THE WORLD TODAY — Wednesday 25 November 2026"**, drawn fully procedurally by `main.ts` (Node 22 stdlib only, no network, deterministic — two runs produce byte-identical PNGs).

The page carries 35 stories, all first reported 25 Nov 2026 (Reuters, BBC, AP, One Turn, Daily Summary, Kyiv Independent, NPR):

- **Lead:** Pakistan's first astronaut reaches China's Tiangong station (Shenzhou-24); mines hit tankers in the Strait of Hormuz; Houthis strike the Ras Tanura refinery and Riyadh's financial district.
- **Stats of the day:** 305 drones downed overnight, ~500,000 Russian war dead in Moscow's own figures, €115 bn Ukraine needs for 2027, 259 Democrat House seats, +36% Bangladesh garment wage, 29 miners trapped in Java.
- **Ten more:** Huawei guilty in the US, China probes Shanghai chief Chen Jining, Cartagena siege ends, Ukraine hits 2 Samara refineries, markets slide on tariff fears, Senegal gets the Africa Cup back, Democrats take 259 House seats, Ábrego García leaves for Spain, Puigdemont to return 12 Dec, Nvidia tumbles again.
- **22 more numbered stories**, a UTC timeline, a 9-region bar, and a world map with numbered pins — plus a DATE CHECK box in the footer.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

This writes `out/entry.png` (1024x1024, under 1 MiB).

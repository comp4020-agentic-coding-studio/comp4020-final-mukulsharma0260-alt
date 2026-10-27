# Mobile layout check

Results of `scripts/check-mobile.ts`, the browser layout checks for the
mobile lounge plan. Each run is against a local throwaway server (a fresh
`/tmp` database), never production, at seven sizes, with and without a star.
A browser that has seen the arrival film enters the lounge, then the script
measures the page.

Phones (at most 600px wide or 500px tall) get every check below. The tablet
and laptop sizes get only the two that apply everywhere: no sideways scroll,
and no overlapping constellation names.

## Before (28 October 2026, at 28a439c)

The baseline before any mobile change. App code is as deployed in v28.
Most phone checks fail, as expected. At 844x390 the field is 0px because the
dock and heading cover it entirely.

| Size | State | Check | Result | Measured |
|---|---|---|---|---|
| 360x844 | no-star | no sideways scroll | pass | overflow 0px |
| 360x844 | no-star | constellation names do not overlap | **fail** | 5 names, overlapping: engineering/business |
| 360x844 | no-star | header ≤ 52px | **fail** | 96px |
| 360x844 | no-star | no heading block | **fail** | heading shown |
| 360x844 | no-star | field ≥ 60% of viewport | **fail** | 209px = 25% |
| 360x844 | no-star | dock ≤ 72px collapsed | **fail** | 402px |
| 360x844 | no-star | callsign not in dock | **fail** | in dock |
| 360x844 | no-star | targets ≥ 44px | **fail** | 5/18 small: Common Room 125x40; Science, quiet 76x40; Engineering, quiet 102x40; Business, quiet 83x40; #traces-toggle 105x36 |
| 360x844 | no-star | conversation is full-screen | **fail** | 360x341 at 0,503 |
| 360x844 | star | no sideways scroll | pass | overflow 0px |
| 360x844 | star | constellation names do not overlap | **fail** | 5 names, overlapping: engineering/business |
| 360x844 | star | header ≤ 52px | **fail** | 96px |
| 360x844 | star | no heading block | **fail** | heading shown |
| 360x844 | star | field ≥ 60% of viewport | **fail** | 238px = 28% |
| 360x844 | star | dock ≤ 72px collapsed | **fail** | 374px |
| 360x844 | star | callsign not in dock | **fail** | in dock |
| 360x844 | star | targets ≥ 44px | **fail** | 5/17 small: Common Room 125x40; Science, quiet 76x40; Engineering, quiet 102x40; Business, quiet 83x40; #traces-toggle 105x36 |
| 360x844 | star | conversation is full-screen | **fail** | 360x341 at 0,503 |
| 390x844 | no-star | no sideways scroll | pass | overflow 0px |
| 390x844 | no-star | constellation names do not overlap | **fail** | 5 names, overlapping: engineering/business |
| 390x844 | no-star | header ≤ 52px | **fail** | 96px |
| 390x844 | no-star | no heading block | **fail** | heading shown |
| 390x844 | no-star | field ≥ 60% of viewport | **fail** | 230px = 27% |
| 390x844 | no-star | dock ≤ 72px collapsed | **fail** | 402px |
| 390x844 | no-star | callsign not in dock | **fail** | in dock |
| 390x844 | no-star | targets ≥ 44px | **fail** | 5/18 small: Common Room 125x40; Science, quiet 76x40; Engineering, quiet 102x40; Business, quiet 83x40; #traces-toggle 105x36 |
| 390x844 | no-star | conversation is full-screen | **fail** | 390x341 at 0,503 |
| 390x844 | star | no sideways scroll | pass | overflow 0px |
| 390x844 | star | constellation names do not overlap | **fail** | 5 names, overlapping: engineering/business |
| 390x844 | star | header ≤ 52px | **fail** | 96px |
| 390x844 | star | no heading block | **fail** | heading shown |
| 390x844 | star | field ≥ 60% of viewport | **fail** | 259px = 31% |
| 390x844 | star | dock ≤ 72px collapsed | **fail** | 374px |
| 390x844 | star | callsign not in dock | **fail** | in dock |
| 390x844 | star | targets ≥ 44px | **fail** | 5/17 small: Common Room 125x40; Science, quiet 76x40; Engineering, quiet 102x40; Business, quiet 83x40; #traces-toggle 105x36 |
| 390x844 | star | conversation is full-screen | **fail** | 390x341 at 0,503 |
| 414x896 | no-star | no sideways scroll | pass | overflow 0px |
| 414x896 | no-star | constellation names do not overlap | **fail** | 5 names, overlapping: engineering/business |
| 414x896 | no-star | header ≤ 52px | **fail** | 96px |
| 414x896 | no-star | no heading block | **fail** | heading shown |
| 414x896 | no-star | field ≥ 60% of viewport | **fail** | 334px = 37% |
| 414x896 | no-star | dock ≤ 72px collapsed | **fail** | 350px |
| 414x896 | no-star | callsign not in dock | **fail** | in dock |
| 414x896 | no-star | targets ≥ 44px | **fail** | 5/18 small: Common Room 125x40; Science, quiet 76x40; Engineering, quiet 102x40; Business, quiet 83x40; #traces-toggle 105x36 |
| 414x896 | no-star | conversation is full-screen | **fail** | 414x341 at 0,555 |
| 414x896 | star | no sideways scroll | pass | overflow 0px |
| 414x896 | star | constellation names do not overlap | **fail** | 5 names, overlapping: engineering/business |
| 414x896 | star | header ≤ 52px | **fail** | 96px |
| 414x896 | star | no heading block | **fail** | heading shown |
| 414x896 | star | field ≥ 60% of viewport | **fail** | 363px = 41% |
| 414x896 | star | dock ≤ 72px collapsed | **fail** | 322px |
| 414x896 | star | callsign not in dock | **fail** | in dock |
| 414x896 | star | targets ≥ 44px | **fail** | 5/17 small: Common Room 125x40; Science, quiet 76x40; Engineering, quiet 102x40; Business, quiet 83x40; #traces-toggle 105x36 |
| 414x896 | star | conversation is full-screen | **fail** | 414x341 at 0,555 |
| 430x932 | no-star | no sideways scroll | pass | overflow 0px |
| 430x932 | no-star | constellation names do not overlap | **fail** | 5 names, overlapping: engineering/business |
| 430x932 | no-star | header ≤ 52px | **fail** | 96px |
| 430x932 | no-star | no heading block | **fail** | heading shown |
| 430x932 | no-star | field ≥ 60% of viewport | **fail** | 391px = 42% |
| 430x932 | no-star | dock ≤ 72px collapsed | **fail** | 330px |
| 430x932 | no-star | callsign not in dock | **fail** | in dock |
| 430x932 | no-star | targets ≥ 44px | **fail** | 6/19 small: Common Room 125x40; Science, quiet 76x40; Engineering, quiet 102x40; Business, quiet 83x40; Health, quiet 67x40; #traces-toggle 105x36 |
| 430x932 | no-star | conversation is full-screen | **fail** | 430x341 at 0,591 |
| 430x932 | star | no sideways scroll | pass | overflow 0px |
| 430x932 | star | constellation names do not overlap | **fail** | 5 names, overlapping: engineering/business |
| 430x932 | star | header ≤ 52px | **fail** | 96px |
| 430x932 | star | no heading block | **fail** | heading shown |
| 430x932 | star | field ≥ 60% of viewport | **fail** | 399px = 43% |
| 430x932 | star | dock ≤ 72px collapsed | **fail** | 322px |
| 430x932 | star | callsign not in dock | **fail** | in dock |
| 430x932 | star | targets ≥ 44px | **fail** | 6/18 small: Common Room 125x40; Science, quiet 76x40; Engineering, quiet 102x40; Business, quiet 83x40; Health, quiet 67x40; #traces-toggle 105x36 |
| 430x932 | star | conversation is full-screen | **fail** | 430x341 at 0,591 |
| 844x390 | no-star | no sideways scroll | pass | overflow 0px |
| 844x390 | no-star | constellation names do not overlap | **fail** | 5 names, overlapping: science/health, business/arts |
| 844x390 | no-star | header ≤ 52px | **fail** | 100px |
| 844x390 | no-star | no heading block | **fail** | heading shown |
| 844x390 | no-star | field ≥ 60% of viewport | **fail** | 0px = 0% |
| 844x390 | no-star | dock ≤ 72px collapsed | **fail** | 190px |
| 844x390 | no-star | callsign not in dock | **fail** | in dock |
| 844x390 | no-star | targets ≥ 44px | **fail** | 6/19 small: Common Room 125x40; Science, quiet 76x40; Engineering, quiet 102x40; Business, quiet 83x40; Health, quiet 67x40; Arts & Society, quie 118x40 |
| 844x390 | no-star | conversation is full-screen | **fail** | 844x320 at 0,70 |
| 844x390 | star | no sideways scroll | pass | overflow 0px |
| 844x390 | star | constellation names do not overlap | **fail** | 5 names, overlapping: science/health, business/arts |
| 844x390 | star | header ≤ 52px | **fail** | 100px |
| 844x390 | star | no heading block | **fail** | heading shown |
| 844x390 | star | field ≥ 60% of viewport | **fail** | 0px = 0% |
| 844x390 | star | dock ≤ 72px collapsed | **fail** | 206px |
| 844x390 | star | callsign not in dock | **fail** | in dock |
| 844x390 | star | targets ≥ 44px | **fail** | 6/18 small: Common Room 125x40; Science, quiet 76x40; Engineering, quiet 102x40; Business, quiet 83x40; Health, quiet 67x40; Arts & Society, quie 118x40 |
| 844x390 | star | conversation is full-screen | **fail** | 844x320 at 0,70 |
| 768x1024 | no-star | no sideways scroll | pass | overflow 0px |
| 768x1024 | no-star | constellation names do not overlap | pass | 5 names, none overlap |
| 768x1024 | star | no sideways scroll | pass | overflow 0px |
| 768x1024 | star | constellation names do not overlap | pass | 5 names, none overlap |
| 1024x768 | no-star | no sideways scroll | pass | overflow 0px |
| 1024x768 | no-star | constellation names do not overlap | pass | 5 names, none overlap |
| 1024x768 | star | no sideways scroll | pass | overflow 0px |
| 1024x768 | star | constellation names do not overlap | pass | 5 names, none overlap |

18 of 98 checks pass.

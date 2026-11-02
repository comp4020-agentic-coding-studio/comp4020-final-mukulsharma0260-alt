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

## After: feat: a calmer mobile lounge

41 of 98 pass (baseline 18). On every phone size the header is now 52px and the heading block is gone. The field still falls short of 60%, and the dock, callsign and full-screen conversation checks still fail: the dock is unchanged until the next commit. The traces toggle is the one target under 44px, and it moves into the dock's collapsible section then. Names still overlap until the constellation layout commit.

| Size | State | Check | Result | Measured |
|---|---|---|---|---|
| 360x844 | no-star | no sideways scroll | pass | overflow 0px |
| 360x844 | no-star | constellation names do not overlap | **fail** | 5 names, overlapping: engineering/business |
| 360x844 | no-star | header ≤ 52px | pass | 52px |
| 360x844 | no-star | no heading block | pass | hidden |
| 360x844 | no-star | field ≥ 60% of viewport | **fail** | 390px = 46% |
| 360x844 | no-star | dock ≤ 72px collapsed | **fail** | 402px |
| 360x844 | no-star | callsign not in dock | **fail** | in dock |
| 360x844 | no-star | targets ≥ 44px | **fail** | 1/12 small: #traces-toggle 105x36 |
| 360x844 | no-star | conversation is full-screen | **fail** | 360x341 at 0,503 |
| 360x844 | star | no sideways scroll | pass | overflow 0px |
| 360x844 | star | constellation names do not overlap | **fail** | 5 names, overlapping: engineering/business |
| 360x844 | star | header ≤ 52px | pass | 52px |
| 360x844 | star | no heading block | pass | hidden |
| 360x844 | star | field ≥ 60% of viewport | **fail** | 418px = 50% |
| 360x844 | star | dock ≤ 72px collapsed | **fail** | 374px |
| 360x844 | star | callsign not in dock | **fail** | in dock |
| 360x844 | star | targets ≥ 44px | **fail** | 1/11 small: #traces-toggle 105x36 |
| 360x844 | star | conversation is full-screen | **fail** | 360x341 at 0,503 |
| 390x844 | no-star | no sideways scroll | pass | overflow 0px |
| 390x844 | no-star | constellation names do not overlap | **fail** | 5 names, overlapping: engineering/business |
| 390x844 | no-star | header ≤ 52px | pass | 52px |
| 390x844 | no-star | no heading block | pass | hidden |
| 390x844 | no-star | field ≥ 60% of viewport | **fail** | 390px = 46% |
| 390x844 | no-star | dock ≤ 72px collapsed | **fail** | 402px |
| 390x844 | no-star | callsign not in dock | **fail** | in dock |
| 390x844 | no-star | targets ≥ 44px | **fail** | 1/12 small: #traces-toggle 105x36 |
| 390x844 | no-star | conversation is full-screen | **fail** | 390x341 at 0,503 |
| 390x844 | star | no sideways scroll | pass | overflow 0px |
| 390x844 | star | constellation names do not overlap | **fail** | 5 names, overlapping: engineering/business |
| 390x844 | star | header ≤ 52px | pass | 52px |
| 390x844 | star | no heading block | pass | hidden |
| 390x844 | star | field ≥ 60% of viewport | **fail** | 418px = 50% |
| 390x844 | star | dock ≤ 72px collapsed | **fail** | 374px |
| 390x844 | star | callsign not in dock | **fail** | in dock |
| 390x844 | star | targets ≥ 44px | **fail** | 1/11 small: #traces-toggle 105x36 |
| 390x844 | star | conversation is full-screen | **fail** | 390x341 at 0,503 |
| 414x896 | no-star | no sideways scroll | pass | overflow 0px |
| 414x896 | no-star | constellation names do not overlap | **fail** | 5 names, overlapping: engineering/business |
| 414x896 | no-star | header ≤ 52px | pass | 52px |
| 414x896 | no-star | no heading block | pass | hidden |
| 414x896 | no-star | field ≥ 60% of viewport | **fail** | 494px = 55% |
| 414x896 | no-star | dock ≤ 72px collapsed | **fail** | 350px |
| 414x896 | no-star | callsign not in dock | **fail** | in dock |
| 414x896 | no-star | targets ≥ 44px | **fail** | 1/12 small: #traces-toggle 105x36 |
| 414x896 | no-star | conversation is full-screen | **fail** | 414x341 at 0,555 |
| 414x896 | star | no sideways scroll | pass | overflow 0px |
| 414x896 | star | constellation names do not overlap | **fail** | 5 names, overlapping: engineering/business |
| 414x896 | star | header ≤ 52px | pass | 52px |
| 414x896 | star | no heading block | pass | hidden |
| 414x896 | star | field ≥ 60% of viewport | **fail** | 522px = 58% |
| 414x896 | star | dock ≤ 72px collapsed | **fail** | 322px |
| 414x896 | star | callsign not in dock | **fail** | in dock |
| 414x896 | star | targets ≥ 44px | **fail** | 1/11 small: #traces-toggle 105x36 |
| 414x896 | star | conversation is full-screen | **fail** | 414x341 at 0,555 |
| 430x932 | no-star | no sideways scroll | pass | overflow 0px |
| 430x932 | no-star | constellation names do not overlap | **fail** | 5 names, overlapping: engineering/business |
| 430x932 | no-star | header ≤ 52px | pass | 52px |
| 430x932 | no-star | no heading block | pass | hidden |
| 430x932 | no-star | field ≥ 60% of viewport | **fail** | 550px = 59% |
| 430x932 | no-star | dock ≤ 72px collapsed | **fail** | 330px |
| 430x932 | no-star | callsign not in dock | **fail** | in dock |
| 430x932 | no-star | targets ≥ 44px | **fail** | 1/12 small: #traces-toggle 105x36 |
| 430x932 | no-star | conversation is full-screen | **fail** | 430x341 at 0,591 |
| 430x932 | star | no sideways scroll | pass | overflow 0px |
| 430x932 | star | constellation names do not overlap | **fail** | 5 names, overlapping: engineering/business |
| 430x932 | star | header ≤ 52px | pass | 52px |
| 430x932 | star | no heading block | pass | hidden |
| 430x932 | star | field ≥ 60% of viewport | pass | 558px = 60% |
| 430x932 | star | dock ≤ 72px collapsed | **fail** | 322px |
| 430x932 | star | callsign not in dock | **fail** | in dock |
| 430x932 | star | targets ≥ 44px | **fail** | 1/11 small: #traces-toggle 105x36 |
| 430x932 | star | conversation is full-screen | **fail** | 430x341 at 0,591 |
| 844x390 | no-star | no sideways scroll | pass | overflow 0px |
| 844x390 | no-star | constellation names do not overlap | **fail** | 5 names, overlapping: science/health, business/arts |
| 844x390 | no-star | header ≤ 52px | pass | 52px |
| 844x390 | no-star | no heading block | pass | hidden |
| 844x390 | no-star | field ≥ 60% of viewport | **fail** | 148px = 38% |
| 844x390 | no-star | dock ≤ 72px collapsed | **fail** | 190px |
| 844x390 | no-star | callsign not in dock | **fail** | in dock |
| 844x390 | no-star | targets ≥ 44px | pass | 11 targets, all ≥ 44px |
| 844x390 | no-star | conversation is full-screen | **fail** | 844x320 at 0,70 |
| 844x390 | star | no sideways scroll | pass | overflow 0px |
| 844x390 | star | constellation names do not overlap | **fail** | 5 names, overlapping: science/health, business/arts |
| 844x390 | star | header ≤ 52px | pass | 52px |
| 844x390 | star | no heading block | pass | hidden |
| 844x390 | star | field ≥ 60% of viewport | **fail** | 132px = 34% |
| 844x390 | star | dock ≤ 72px collapsed | **fail** | 206px |
| 844x390 | star | callsign not in dock | **fail** | in dock |
| 844x390 | star | targets ≥ 44px | pass | 10 targets, all ≥ 44px |
| 844x390 | star | conversation is full-screen | **fail** | 844x320 at 0,70 |
| 768x1024 | no-star | no sideways scroll | pass | overflow 0px |
| 768x1024 | no-star | constellation names do not overlap | pass | 5 names, none overlap |
| 768x1024 | star | no sideways scroll | pass | overflow 0px |
| 768x1024 | star | constellation names do not overlap | pass | 5 names, none overlap |
| 1024x768 | no-star | no sideways scroll | pass | overflow 0px |
| 1024x768 | no-star | constellation names do not overlap | pass | 5 names, none overlap |
| 1024x768 | star | no sideways scroll | pass | overflow 0px |
| 1024x768 | star | constellation names do not overlap | pass | 5 names, none overlap |

41 of 98 checks pass.

## After: feat: a collapsible dock, and the callsign inside the conversation

90 of 98 pass (baseline 18, previous 41). At 390x844 the field is now 87% of the screen (731-735px) and the collapsed dock 57-61px; in 844x390 landscape the field is 71-72%. The callsign form is in the conversation on every phone size, and the conversation is full-screen. The eight remaining failures are all the Engineering and Business names overlapping on portrait phones, which the next commit fixes.

| Size | State | Check | Result | Measured |
|---|---|---|---|---|
| 360x844 | no-star | no sideways scroll | pass | overflow 0px |
| 360x844 | no-star | constellation names do not overlap | **fail** | 5 names, overlapping: engineering/business |
| 360x844 | no-star | header ≤ 52px | pass | 52px |
| 360x844 | no-star | no heading block | pass | hidden |
| 360x844 | no-star | field ≥ 60% of viewport | pass | 731px = 87% |
| 360x844 | no-star | dock ≤ 72px collapsed | pass | 61px |
| 360x844 | no-star | callsign not in dock | pass | not in dock |
| 360x844 | no-star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 360x844 | no-star | conversation is full-screen | pass | 360x844 at 0,0 |
| 360x844 | star | no sideways scroll | pass | overflow 0px |
| 360x844 | star | constellation names do not overlap | **fail** | 5 names, overlapping: engineering/business |
| 360x844 | star | header ≤ 52px | pass | 52px |
| 360x844 | star | no heading block | pass | hidden |
| 360x844 | star | field ≥ 60% of viewport | pass | 735px = 87% |
| 360x844 | star | dock ≤ 72px collapsed | pass | 57px |
| 360x844 | star | callsign not in dock | pass | not in dock |
| 360x844 | star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 360x844 | star | conversation is full-screen | pass | 360x844 at 0,0 |
| 390x844 | no-star | no sideways scroll | pass | overflow 0px |
| 390x844 | no-star | constellation names do not overlap | **fail** | 5 names, overlapping: engineering/business |
| 390x844 | no-star | header ≤ 52px | pass | 52px |
| 390x844 | no-star | no heading block | pass | hidden |
| 390x844 | no-star | field ≥ 60% of viewport | pass | 731px = 87% |
| 390x844 | no-star | dock ≤ 72px collapsed | pass | 61px |
| 390x844 | no-star | callsign not in dock | pass | not in dock |
| 390x844 | no-star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 390x844 | no-star | conversation is full-screen | pass | 390x844 at 0,0 |
| 390x844 | star | no sideways scroll | pass | overflow 0px |
| 390x844 | star | constellation names do not overlap | **fail** | 5 names, overlapping: engineering/business |
| 390x844 | star | header ≤ 52px | pass | 52px |
| 390x844 | star | no heading block | pass | hidden |
| 390x844 | star | field ≥ 60% of viewport | pass | 735px = 87% |
| 390x844 | star | dock ≤ 72px collapsed | pass | 57px |
| 390x844 | star | callsign not in dock | pass | not in dock |
| 390x844 | star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 390x844 | star | conversation is full-screen | pass | 390x844 at 0,0 |
| 414x896 | no-star | no sideways scroll | pass | overflow 0px |
| 414x896 | no-star | constellation names do not overlap | **fail** | 5 names, overlapping: engineering/business |
| 414x896 | no-star | header ≤ 52px | pass | 52px |
| 414x896 | no-star | no heading block | pass | hidden |
| 414x896 | no-star | field ≥ 60% of viewport | pass | 783px = 87% |
| 414x896 | no-star | dock ≤ 72px collapsed | pass | 61px |
| 414x896 | no-star | callsign not in dock | pass | not in dock |
| 414x896 | no-star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 414x896 | no-star | conversation is full-screen | pass | 414x896 at 0,0 |
| 414x896 | star | no sideways scroll | pass | overflow 0px |
| 414x896 | star | constellation names do not overlap | **fail** | 5 names, overlapping: engineering/business |
| 414x896 | star | header ≤ 52px | pass | 52px |
| 414x896 | star | no heading block | pass | hidden |
| 414x896 | star | field ≥ 60% of viewport | pass | 787px = 88% |
| 414x896 | star | dock ≤ 72px collapsed | pass | 57px |
| 414x896 | star | callsign not in dock | pass | not in dock |
| 414x896 | star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 414x896 | star | conversation is full-screen | pass | 414x896 at 0,0 |
| 430x932 | no-star | no sideways scroll | pass | overflow 0px |
| 430x932 | no-star | constellation names do not overlap | **fail** | 5 names, overlapping: engineering/business |
| 430x932 | no-star | header ≤ 52px | pass | 52px |
| 430x932 | no-star | no heading block | pass | hidden |
| 430x932 | no-star | field ≥ 60% of viewport | pass | 819px = 88% |
| 430x932 | no-star | dock ≤ 72px collapsed | pass | 61px |
| 430x932 | no-star | callsign not in dock | pass | not in dock |
| 430x932 | no-star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 430x932 | no-star | conversation is full-screen | pass | 430x932 at 0,0 |
| 430x932 | star | no sideways scroll | pass | overflow 0px |
| 430x932 | star | constellation names do not overlap | **fail** | 5 names, overlapping: engineering/business |
| 430x932 | star | header ≤ 52px | pass | 52px |
| 430x932 | star | no heading block | pass | hidden |
| 430x932 | star | field ≥ 60% of viewport | pass | 823px = 88% |
| 430x932 | star | dock ≤ 72px collapsed | pass | 57px |
| 430x932 | star | callsign not in dock | pass | not in dock |
| 430x932 | star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 430x932 | star | conversation is full-screen | pass | 430x932 at 0,0 |
| 844x390 | no-star | no sideways scroll | pass | overflow 0px |
| 844x390 | no-star | constellation names do not overlap | pass | 5 names, none overlap |
| 844x390 | no-star | header ≤ 52px | pass | 52px |
| 844x390 | no-star | no heading block | pass | hidden |
| 844x390 | no-star | field ≥ 60% of viewport | pass | 277px = 71% |
| 844x390 | no-star | dock ≤ 72px collapsed | pass | 61px |
| 844x390 | no-star | callsign not in dock | pass | not in dock |
| 844x390 | no-star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 844x390 | no-star | conversation is full-screen | pass | 844x390 at 0,0 |
| 844x390 | star | no sideways scroll | pass | overflow 0px |
| 844x390 | star | constellation names do not overlap | pass | 5 names, none overlap |
| 844x390 | star | header ≤ 52px | pass | 52px |
| 844x390 | star | no heading block | pass | hidden |
| 844x390 | star | field ≥ 60% of viewport | pass | 281px = 72% |
| 844x390 | star | dock ≤ 72px collapsed | pass | 57px |
| 844x390 | star | callsign not in dock | pass | not in dock |
| 844x390 | star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 844x390 | star | conversation is full-screen | pass | 844x390 at 0,0 |
| 768x1024 | no-star | no sideways scroll | pass | overflow 0px |
| 768x1024 | no-star | constellation names do not overlap | pass | 5 names, none overlap |
| 768x1024 | star | no sideways scroll | pass | overflow 0px |
| 768x1024 | star | constellation names do not overlap | pass | 5 names, none overlap |
| 1024x768 | no-star | no sideways scroll | pass | overflow 0px |
| 1024x768 | no-star | constellation names do not overlap | pass | 5 names, none overlap |
| 1024x768 | star | no sideways scroll | pass | overflow 0px |
| 1024x768 | star | constellation names do not overlap | pass | 5 names, none overlap |

90 of 98 checks pass.

## After: fix: keep constellation names apart on phones

112 of 112 pass (baseline 18 of 98, previous 90 of 98). This run adds one check per cell, "constellation names fully on screen", so the total is now 112: Arts & Society ran off the edge at 360 and 390px before this commit, and the new check failed on that code first. Names stay 12px; each anchors toward the middle of the screen, and on the narrowest phones Engineering is measured and moved just below Business when their boxes would meet.

| Size | State | Check | Result | Measured |
|---|---|---|---|---|
| 360x844 | no-star | no sideways scroll | pass | overflow 0px |
| 360x844 | no-star | constellation names fully on screen | pass | 5 names inside 360px |
| 360x844 | no-star | constellation names do not overlap | pass | 5 names, none overlap |
| 360x844 | no-star | header ≤ 52px | pass | 52px |
| 360x844 | no-star | no heading block | pass | hidden |
| 360x844 | no-star | field ≥ 60% of viewport | pass | 731px = 87% |
| 360x844 | no-star | dock ≤ 72px collapsed | pass | 61px |
| 360x844 | no-star | callsign not in dock | pass | not in dock |
| 360x844 | no-star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 360x844 | no-star | conversation is full-screen | pass | 360x844 at 0,0 |
| 360x844 | star | no sideways scroll | pass | overflow 0px |
| 360x844 | star | constellation names fully on screen | pass | 5 names inside 360px |
| 360x844 | star | constellation names do not overlap | pass | 5 names, none overlap |
| 360x844 | star | header ≤ 52px | pass | 52px |
| 360x844 | star | no heading block | pass | hidden |
| 360x844 | star | field ≥ 60% of viewport | pass | 735px = 87% |
| 360x844 | star | dock ≤ 72px collapsed | pass | 57px |
| 360x844 | star | callsign not in dock | pass | not in dock |
| 360x844 | star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 360x844 | star | conversation is full-screen | pass | 360x844 at 0,0 |
| 390x844 | no-star | no sideways scroll | pass | overflow 0px |
| 390x844 | no-star | constellation names fully on screen | pass | 5 names inside 390px |
| 390x844 | no-star | constellation names do not overlap | pass | 5 names, none overlap |
| 390x844 | no-star | header ≤ 52px | pass | 52px |
| 390x844 | no-star | no heading block | pass | hidden |
| 390x844 | no-star | field ≥ 60% of viewport | pass | 731px = 87% |
| 390x844 | no-star | dock ≤ 72px collapsed | pass | 61px |
| 390x844 | no-star | callsign not in dock | pass | not in dock |
| 390x844 | no-star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 390x844 | no-star | conversation is full-screen | pass | 390x844 at 0,0 |
| 390x844 | star | no sideways scroll | pass | overflow 0px |
| 390x844 | star | constellation names fully on screen | pass | 5 names inside 390px |
| 390x844 | star | constellation names do not overlap | pass | 5 names, none overlap |
| 390x844 | star | header ≤ 52px | pass | 52px |
| 390x844 | star | no heading block | pass | hidden |
| 390x844 | star | field ≥ 60% of viewport | pass | 735px = 87% |
| 390x844 | star | dock ≤ 72px collapsed | pass | 57px |
| 390x844 | star | callsign not in dock | pass | not in dock |
| 390x844 | star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 390x844 | star | conversation is full-screen | pass | 390x844 at 0,0 |
| 414x896 | no-star | no sideways scroll | pass | overflow 0px |
| 414x896 | no-star | constellation names fully on screen | pass | 5 names inside 414px |
| 414x896 | no-star | constellation names do not overlap | pass | 5 names, none overlap |
| 414x896 | no-star | header ≤ 52px | pass | 52px |
| 414x896 | no-star | no heading block | pass | hidden |
| 414x896 | no-star | field ≥ 60% of viewport | pass | 783px = 87% |
| 414x896 | no-star | dock ≤ 72px collapsed | pass | 61px |
| 414x896 | no-star | callsign not in dock | pass | not in dock |
| 414x896 | no-star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 414x896 | no-star | conversation is full-screen | pass | 414x896 at 0,0 |
| 414x896 | star | no sideways scroll | pass | overflow 0px |
| 414x896 | star | constellation names fully on screen | pass | 5 names inside 414px |
| 414x896 | star | constellation names do not overlap | pass | 5 names, none overlap |
| 414x896 | star | header ≤ 52px | pass | 52px |
| 414x896 | star | no heading block | pass | hidden |
| 414x896 | star | field ≥ 60% of viewport | pass | 787px = 88% |
| 414x896 | star | dock ≤ 72px collapsed | pass | 57px |
| 414x896 | star | callsign not in dock | pass | not in dock |
| 414x896 | star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 414x896 | star | conversation is full-screen | pass | 414x896 at 0,0 |
| 430x932 | no-star | no sideways scroll | pass | overflow 0px |
| 430x932 | no-star | constellation names fully on screen | pass | 5 names inside 430px |
| 430x932 | no-star | constellation names do not overlap | pass | 5 names, none overlap |
| 430x932 | no-star | header ≤ 52px | pass | 52px |
| 430x932 | no-star | no heading block | pass | hidden |
| 430x932 | no-star | field ≥ 60% of viewport | pass | 819px = 88% |
| 430x932 | no-star | dock ≤ 72px collapsed | pass | 61px |
| 430x932 | no-star | callsign not in dock | pass | not in dock |
| 430x932 | no-star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 430x932 | no-star | conversation is full-screen | pass | 430x932 at 0,0 |
| 430x932 | star | no sideways scroll | pass | overflow 0px |
| 430x932 | star | constellation names fully on screen | pass | 5 names inside 430px |
| 430x932 | star | constellation names do not overlap | pass | 5 names, none overlap |
| 430x932 | star | header ≤ 52px | pass | 52px |
| 430x932 | star | no heading block | pass | hidden |
| 430x932 | star | field ≥ 60% of viewport | pass | 823px = 88% |
| 430x932 | star | dock ≤ 72px collapsed | pass | 57px |
| 430x932 | star | callsign not in dock | pass | not in dock |
| 430x932 | star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 430x932 | star | conversation is full-screen | pass | 430x932 at 0,0 |
| 844x390 | no-star | no sideways scroll | pass | overflow 0px |
| 844x390 | no-star | constellation names fully on screen | pass | 5 names inside 844px |
| 844x390 | no-star | constellation names do not overlap | pass | 5 names, none overlap |
| 844x390 | no-star | header ≤ 52px | pass | 52px |
| 844x390 | no-star | no heading block | pass | hidden |
| 844x390 | no-star | field ≥ 60% of viewport | pass | 277px = 71% |
| 844x390 | no-star | dock ≤ 72px collapsed | pass | 61px |
| 844x390 | no-star | callsign not in dock | pass | not in dock |
| 844x390 | no-star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 844x390 | no-star | conversation is full-screen | pass | 844x390 at 0,0 |
| 844x390 | star | no sideways scroll | pass | overflow 0px |
| 844x390 | star | constellation names fully on screen | pass | 5 names inside 844px |
| 844x390 | star | constellation names do not overlap | pass | 5 names, none overlap |
| 844x390 | star | header ≤ 52px | pass | 52px |
| 844x390 | star | no heading block | pass | hidden |
| 844x390 | star | field ≥ 60% of viewport | pass | 281px = 72% |
| 844x390 | star | dock ≤ 72px collapsed | pass | 57px |
| 844x390 | star | callsign not in dock | pass | not in dock |
| 844x390 | star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 844x390 | star | conversation is full-screen | pass | 844x390 at 0,0 |
| 768x1024 | no-star | no sideways scroll | pass | overflow 0px |
| 768x1024 | no-star | constellation names fully on screen | pass | 5 names inside 768px |
| 768x1024 | no-star | constellation names do not overlap | pass | 5 names, none overlap |
| 768x1024 | star | no sideways scroll | pass | overflow 0px |
| 768x1024 | star | constellation names fully on screen | pass | 5 names inside 768px |
| 768x1024 | star | constellation names do not overlap | pass | 5 names, none overlap |
| 1024x768 | no-star | no sideways scroll | pass | overflow 0px |
| 1024x768 | no-star | constellation names fully on screen | pass | 5 names inside 1024px |
| 1024x768 | no-star | constellation names do not overlap | pass | 5 names, none overlap |
| 1024x768 | star | no sideways scroll | pass | overflow 0px |
| 1024x768 | star | constellation names fully on screen | pass | 5 names inside 1024px |
| 1024x768 | star | constellation names do not overlap | pass | 5 names, none overlap |

112 of 112 checks pass.

## After: fix: tap feedback, contrast and row spacing on phones

112 of 112 pass, unchanged; this commit fixes what the touch and accessibility review found, which these layout checks do not measure. Measured at 390x844: the quiet line and the field's counts were 4.1:1 against the lightest view tint and are now 6.5:1; sheet rows were 4px apart and are now 8px.

| Size | State | Check | Result | Measured |
|---|---|---|---|---|
| 360x844 | no-star | no sideways scroll | pass | overflow 0px |
| 360x844 | no-star | constellation names fully on screen | pass | 5 names inside 360px |
| 360x844 | no-star | constellation names do not overlap | pass | 5 names, none overlap |
| 360x844 | no-star | header ≤ 52px | pass | 52px |
| 360x844 | no-star | no heading block | pass | hidden |
| 360x844 | no-star | field ≥ 60% of viewport | pass | 731px = 87% |
| 360x844 | no-star | dock ≤ 72px collapsed | pass | 61px |
| 360x844 | no-star | callsign not in dock | pass | not in dock |
| 360x844 | no-star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 360x844 | no-star | conversation is full-screen | pass | 360x844 at 0,0 |
| 360x844 | star | no sideways scroll | pass | overflow 0px |
| 360x844 | star | constellation names fully on screen | pass | 5 names inside 360px |
| 360x844 | star | constellation names do not overlap | pass | 5 names, none overlap |
| 360x844 | star | header ≤ 52px | pass | 52px |
| 360x844 | star | no heading block | pass | hidden |
| 360x844 | star | field ≥ 60% of viewport | pass | 735px = 87% |
| 360x844 | star | dock ≤ 72px collapsed | pass | 57px |
| 360x844 | star | callsign not in dock | pass | not in dock |
| 360x844 | star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 360x844 | star | conversation is full-screen | pass | 360x844 at 0,0 |
| 390x844 | no-star | no sideways scroll | pass | overflow 0px |
| 390x844 | no-star | constellation names fully on screen | pass | 5 names inside 390px |
| 390x844 | no-star | constellation names do not overlap | pass | 5 names, none overlap |
| 390x844 | no-star | header ≤ 52px | pass | 52px |
| 390x844 | no-star | no heading block | pass | hidden |
| 390x844 | no-star | field ≥ 60% of viewport | pass | 731px = 87% |
| 390x844 | no-star | dock ≤ 72px collapsed | pass | 61px |
| 390x844 | no-star | callsign not in dock | pass | not in dock |
| 390x844 | no-star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 390x844 | no-star | conversation is full-screen | pass | 390x844 at 0,0 |
| 390x844 | star | no sideways scroll | pass | overflow 0px |
| 390x844 | star | constellation names fully on screen | pass | 5 names inside 390px |
| 390x844 | star | constellation names do not overlap | pass | 5 names, none overlap |
| 390x844 | star | header ≤ 52px | pass | 52px |
| 390x844 | star | no heading block | pass | hidden |
| 390x844 | star | field ≥ 60% of viewport | pass | 735px = 87% |
| 390x844 | star | dock ≤ 72px collapsed | pass | 57px |
| 390x844 | star | callsign not in dock | pass | not in dock |
| 390x844 | star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 390x844 | star | conversation is full-screen | pass | 390x844 at 0,0 |
| 414x896 | no-star | no sideways scroll | pass | overflow 0px |
| 414x896 | no-star | constellation names fully on screen | pass | 5 names inside 414px |
| 414x896 | no-star | constellation names do not overlap | pass | 5 names, none overlap |
| 414x896 | no-star | header ≤ 52px | pass | 52px |
| 414x896 | no-star | no heading block | pass | hidden |
| 414x896 | no-star | field ≥ 60% of viewport | pass | 783px = 87% |
| 414x896 | no-star | dock ≤ 72px collapsed | pass | 61px |
| 414x896 | no-star | callsign not in dock | pass | not in dock |
| 414x896 | no-star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 414x896 | no-star | conversation is full-screen | pass | 414x896 at 0,0 |
| 414x896 | star | no sideways scroll | pass | overflow 0px |
| 414x896 | star | constellation names fully on screen | pass | 5 names inside 414px |
| 414x896 | star | constellation names do not overlap | pass | 5 names, none overlap |
| 414x896 | star | header ≤ 52px | pass | 52px |
| 414x896 | star | no heading block | pass | hidden |
| 414x896 | star | field ≥ 60% of viewport | pass | 787px = 88% |
| 414x896 | star | dock ≤ 72px collapsed | pass | 57px |
| 414x896 | star | callsign not in dock | pass | not in dock |
| 414x896 | star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 414x896 | star | conversation is full-screen | pass | 414x896 at 0,0 |
| 430x932 | no-star | no sideways scroll | pass | overflow 0px |
| 430x932 | no-star | constellation names fully on screen | pass | 5 names inside 430px |
| 430x932 | no-star | constellation names do not overlap | pass | 5 names, none overlap |
| 430x932 | no-star | header ≤ 52px | pass | 52px |
| 430x932 | no-star | no heading block | pass | hidden |
| 430x932 | no-star | field ≥ 60% of viewport | pass | 819px = 88% |
| 430x932 | no-star | dock ≤ 72px collapsed | pass | 61px |
| 430x932 | no-star | callsign not in dock | pass | not in dock |
| 430x932 | no-star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 430x932 | no-star | conversation is full-screen | pass | 430x932 at 0,0 |
| 430x932 | star | no sideways scroll | pass | overflow 0px |
| 430x932 | star | constellation names fully on screen | pass | 5 names inside 430px |
| 430x932 | star | constellation names do not overlap | pass | 5 names, none overlap |
| 430x932 | star | header ≤ 52px | pass | 52px |
| 430x932 | star | no heading block | pass | hidden |
| 430x932 | star | field ≥ 60% of viewport | pass | 823px = 88% |
| 430x932 | star | dock ≤ 72px collapsed | pass | 57px |
| 430x932 | star | callsign not in dock | pass | not in dock |
| 430x932 | star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 430x932 | star | conversation is full-screen | pass | 430x932 at 0,0 |
| 844x390 | no-star | no sideways scroll | pass | overflow 0px |
| 844x390 | no-star | constellation names fully on screen | pass | 5 names inside 844px |
| 844x390 | no-star | constellation names do not overlap | pass | 5 names, none overlap |
| 844x390 | no-star | header ≤ 52px | pass | 52px |
| 844x390 | no-star | no heading block | pass | hidden |
| 844x390 | no-star | field ≥ 60% of viewport | pass | 277px = 71% |
| 844x390 | no-star | dock ≤ 72px collapsed | pass | 61px |
| 844x390 | no-star | callsign not in dock | pass | not in dock |
| 844x390 | no-star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 844x390 | no-star | conversation is full-screen | pass | 844x390 at 0,0 |
| 844x390 | star | no sideways scroll | pass | overflow 0px |
| 844x390 | star | constellation names fully on screen | pass | 5 names inside 844px |
| 844x390 | star | constellation names do not overlap | pass | 5 names, none overlap |
| 844x390 | star | header ≤ 52px | pass | 52px |
| 844x390 | star | no heading block | pass | hidden |
| 844x390 | star | field ≥ 60% of viewport | pass | 281px = 72% |
| 844x390 | star | dock ≤ 72px collapsed | pass | 57px |
| 844x390 | star | callsign not in dock | pass | not in dock |
| 844x390 | star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 844x390 | star | conversation is full-screen | pass | 844x390 at 0,0 |
| 768x1024 | no-star | no sideways scroll | pass | overflow 0px |
| 768x1024 | no-star | constellation names fully on screen | pass | 5 names inside 768px |
| 768x1024 | no-star | constellation names do not overlap | pass | 5 names, none overlap |
| 768x1024 | star | no sideways scroll | pass | overflow 0px |
| 768x1024 | star | constellation names fully on screen | pass | 5 names inside 768px |
| 768x1024 | star | constellation names do not overlap | pass | 5 names, none overlap |
| 1024x768 | no-star | no sideways scroll | pass | overflow 0px |
| 1024x768 | no-star | constellation names fully on screen | pass | 5 names inside 1024px |
| 1024x768 | no-star | constellation names do not overlap | pass | 5 names, none overlap |
| 1024x768 | star | no sideways scroll | pass | overflow 0px |
| 1024x768 | star | constellation names fully on screen | pass | 5 names inside 1024px |
| 1024x768 | star | constellation names do not overlap | pass | 5 names, none overlap |

112 of 112 checks pass.

## After: the final bug-fix and performance pass (0123b06)

112 of 112 pass, unchanged; this pass changed the map, views, settling, film captions and the arrival, and none of them broke a phone layout check. Run on a fresh throwaway server with the laptop awake.

| Size | State | Check | Result | Measured |
|---|---|---|---|---|
| 360x844 | no-star | no sideways scroll | pass | overflow 0px |
| 360x844 | no-star | constellation names fully on screen | pass | 5 names inside 360px |
| 360x844 | no-star | constellation names do not overlap | pass | 5 names, none overlap |
| 360x844 | no-star | header ≤ 52px | pass | 52px |
| 360x844 | no-star | no heading block | pass | hidden |
| 360x844 | no-star | field ≥ 60% of viewport | pass | 731px = 87% |
| 360x844 | no-star | dock ≤ 72px collapsed | pass | 61px |
| 360x844 | no-star | callsign not in dock | pass | not in dock |
| 360x844 | no-star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 360x844 | no-star | conversation is full-screen | pass | 360x844 at 0,0 |
| 360x844 | star | no sideways scroll | pass | overflow 0px |
| 360x844 | star | constellation names fully on screen | pass | 5 names inside 360px |
| 360x844 | star | constellation names do not overlap | pass | 5 names, none overlap |
| 360x844 | star | header ≤ 52px | pass | 52px |
| 360x844 | star | no heading block | pass | hidden |
| 360x844 | star | field ≥ 60% of viewport | pass | 735px = 87% |
| 360x844 | star | dock ≤ 72px collapsed | pass | 57px |
| 360x844 | star | callsign not in dock | pass | not in dock |
| 360x844 | star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 360x844 | star | conversation is full-screen | pass | 360x844 at 0,0 |
| 390x844 | no-star | no sideways scroll | pass | overflow 0px |
| 390x844 | no-star | constellation names fully on screen | pass | 5 names inside 390px |
| 390x844 | no-star | constellation names do not overlap | pass | 5 names, none overlap |
| 390x844 | no-star | header ≤ 52px | pass | 52px |
| 390x844 | no-star | no heading block | pass | hidden |
| 390x844 | no-star | field ≥ 60% of viewport | pass | 731px = 87% |
| 390x844 | no-star | dock ≤ 72px collapsed | pass | 61px |
| 390x844 | no-star | callsign not in dock | pass | not in dock |
| 390x844 | no-star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 390x844 | no-star | conversation is full-screen | pass | 390x844 at 0,0 |
| 390x844 | star | no sideways scroll | pass | overflow 0px |
| 390x844 | star | constellation names fully on screen | pass | 5 names inside 390px |
| 390x844 | star | constellation names do not overlap | pass | 5 names, none overlap |
| 390x844 | star | header ≤ 52px | pass | 52px |
| 390x844 | star | no heading block | pass | hidden |
| 390x844 | star | field ≥ 60% of viewport | pass | 735px = 87% |
| 390x844 | star | dock ≤ 72px collapsed | pass | 57px |
| 390x844 | star | callsign not in dock | pass | not in dock |
| 390x844 | star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 390x844 | star | conversation is full-screen | pass | 390x844 at 0,0 |
| 414x896 | no-star | no sideways scroll | pass | overflow 0px |
| 414x896 | no-star | constellation names fully on screen | pass | 5 names inside 414px |
| 414x896 | no-star | constellation names do not overlap | pass | 5 names, none overlap |
| 414x896 | no-star | header ≤ 52px | pass | 52px |
| 414x896 | no-star | no heading block | pass | hidden |
| 414x896 | no-star | field ≥ 60% of viewport | pass | 783px = 87% |
| 414x896 | no-star | dock ≤ 72px collapsed | pass | 61px |
| 414x896 | no-star | callsign not in dock | pass | not in dock |
| 414x896 | no-star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 414x896 | no-star | conversation is full-screen | pass | 414x896 at 0,0 |
| 414x896 | star | no sideways scroll | pass | overflow 0px |
| 414x896 | star | constellation names fully on screen | pass | 5 names inside 414px |
| 414x896 | star | constellation names do not overlap | pass | 5 names, none overlap |
| 414x896 | star | header ≤ 52px | pass | 52px |
| 414x896 | star | no heading block | pass | hidden |
| 414x896 | star | field ≥ 60% of viewport | pass | 787px = 88% |
| 414x896 | star | dock ≤ 72px collapsed | pass | 57px |
| 414x896 | star | callsign not in dock | pass | not in dock |
| 414x896 | star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 414x896 | star | conversation is full-screen | pass | 414x896 at 0,0 |
| 430x932 | no-star | no sideways scroll | pass | overflow 0px |
| 430x932 | no-star | constellation names fully on screen | pass | 5 names inside 430px |
| 430x932 | no-star | constellation names do not overlap | pass | 5 names, none overlap |
| 430x932 | no-star | header ≤ 52px | pass | 52px |
| 430x932 | no-star | no heading block | pass | hidden |
| 430x932 | no-star | field ≥ 60% of viewport | pass | 819px = 88% |
| 430x932 | no-star | dock ≤ 72px collapsed | pass | 61px |
| 430x932 | no-star | callsign not in dock | pass | not in dock |
| 430x932 | no-star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 430x932 | no-star | conversation is full-screen | pass | 430x932 at 0,0 |
| 430x932 | star | no sideways scroll | pass | overflow 0px |
| 430x932 | star | constellation names fully on screen | pass | 5 names inside 430px |
| 430x932 | star | constellation names do not overlap | pass | 5 names, none overlap |
| 430x932 | star | header ≤ 52px | pass | 52px |
| 430x932 | star | no heading block | pass | hidden |
| 430x932 | star | field ≥ 60% of viewport | pass | 823px = 88% |
| 430x932 | star | dock ≤ 72px collapsed | pass | 57px |
| 430x932 | star | callsign not in dock | pass | not in dock |
| 430x932 | star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 430x932 | star | conversation is full-screen | pass | 430x932 at 0,0 |
| 844x390 | no-star | no sideways scroll | pass | overflow 0px |
| 844x390 | no-star | constellation names fully on screen | pass | 5 names inside 844px |
| 844x390 | no-star | constellation names do not overlap | pass | 5 names, none overlap |
| 844x390 | no-star | header ≤ 52px | pass | 52px |
| 844x390 | no-star | no heading block | pass | hidden |
| 844x390 | no-star | field ≥ 60% of viewport | pass | 277px = 71% |
| 844x390 | no-star | dock ≤ 72px collapsed | pass | 61px |
| 844x390 | no-star | callsign not in dock | pass | not in dock |
| 844x390 | no-star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 844x390 | no-star | conversation is full-screen | pass | 844x390 at 0,0 |
| 844x390 | star | no sideways scroll | pass | overflow 0px |
| 844x390 | star | constellation names fully on screen | pass | 5 names inside 844px |
| 844x390 | star | constellation names do not overlap | pass | 5 names, none overlap |
| 844x390 | star | header ≤ 52px | pass | 52px |
| 844x390 | star | no heading block | pass | hidden |
| 844x390 | star | field ≥ 60% of viewport | pass | 281px = 72% |
| 844x390 | star | dock ≤ 72px collapsed | pass | 57px |
| 844x390 | star | callsign not in dock | pass | not in dock |
| 844x390 | star | targets ≥ 44px | pass | 9 targets, all ≥ 44px |
| 844x390 | star | conversation is full-screen | pass | 844x390 at 0,0 |
| 768x1024 | no-star | no sideways scroll | pass | overflow 0px |
| 768x1024 | no-star | constellation names fully on screen | pass | 5 names inside 768px |
| 768x1024 | no-star | constellation names do not overlap | pass | 5 names, none overlap |
| 768x1024 | star | no sideways scroll | pass | overflow 0px |
| 768x1024 | star | constellation names fully on screen | pass | 5 names inside 768px |
| 768x1024 | star | constellation names do not overlap | pass | 5 names, none overlap |
| 1024x768 | no-star | no sideways scroll | pass | overflow 0px |
| 1024x768 | no-star | constellation names fully on screen | pass | 5 names inside 1024px |
| 1024x768 | no-star | constellation names do not overlap | pass | 5 names, none overlap |
| 1024x768 | star | no sideways scroll | pass | overflow 0px |
| 1024x768 | star | constellation names fully on screen | pass | 5 names inside 1024px |
| 1024x768 | star | constellation names do not overlap | pass | 5 names, none overlap |

112 of 112 checks pass.

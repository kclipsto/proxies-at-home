# Changelog

## [0.0.2] - 2026-02-07

### Changes

- 6638f326 fix: have release automation just run on serate branch, will need manual PRs/merge (#159)
- 4ae0eace feat: add Silhouette Cameo print & cut support (#153)
- 94d3a619 fix: cards with built in bleed had double trim applied (#156)
- 4d1ecb8c fix: improve import language settings (#154)
- 42f3f02f feat: auto detect built in bleed (#152)
- f54384c1 feat: export displayed (#150)
- 06ac5a11 fix: print population, dfc linking, search reliability (#149)
- 86e1f1cc fix: mixed content (#146)
- c8c0e9ac fix: correctly trim bleed for cards with built in bleed on export (#145)
- 7f91c137 fix: bleed generation uses built in bleed for pdf (#141)
- 58313a3e fix: cut guide and darken pixels settings for PDF export (#139)
- a471af59 fix: dfc card back replaces correctly after replacing error card (#135)
- d00b5364 fix: make blank cardback load correctly (#134)
- c41014a5 fix: update prerender to not include localhost in output (#133)
- c6390163 feat: add SEO improvements for better Google indexing (#131)
- 323ca7cb fix: make sure editor sliders are visible (#130)
- 13da1923 table migrations
- 620a20f5 minor fix to create cardback folder if it does not exist
- 14e645c6 Fix/cleanup bundle (#127)
- e1dd1c35 feat: add project switch/sharing, unifiy import infra, plus more (#126)
- 4804a92c feat: back face specific offset (#122)
- a88fb73d fix: Correct brightness scaling (#120)
- ea75dafb fix: artwork modal fixes and UI/UX improvments
- 8475351d fix: improve DFC handling with custom cards
- 9180484c feat: improve token support to enable token import, search, and replace
- abbf9b7e feat: Add automatic token import linked from cards
- e484b31c fix: add back source grouping
- 95bb7971 fix: filter bar settings stay the same when navigating between cards
- e37454d3 fix: make sure search uses selected art source
- 7bab0b99 fix: have release automation make a separate branch and pr instead of direct to main
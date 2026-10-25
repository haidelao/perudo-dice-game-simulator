# Live odds coach

Click **Show odds** near the game heading. Click **Hide odds** to close it. The panel appears alongside the table on desktop, and below the play controls on narrow screens. Its visibility and assumptions are saved separately from the game replay in `its-a-lie:coach:v1`. Reloading the preview loads the new code; resume the saved table if necessary.

## Raw dice probabilities

The panel receives only `observation(game, 0)`: public counts and bids, the human's visible hand, and no opponent hands or dice seed. It does not use private bot explanations. It stops calculating at reveal/game-over, rather than mixing post-loss dice counts with the old roll.

Let `N` be total dice, `v` the number of visible dice, `k` the matching visible dice, and `q` the claim quantity. Unknown dice `U = N - v`. For a regular face, `k` includes that face plus aces and each unknown die matches with probability `p = 1/3`. For an ace bid, only aces match and `p = 1/6`.

```text
X ~ Binomial(U, p)
Claim true = P(X >= q - k)
Dudo succeeds = 1 - P(claim true)
Exactly right = P(X = q - k)
Expected count = k + U * p
```

When the human is blind, no own dice are known and all `N` dice remain unknown. The panel always uses human information, even during a bot turn. An expected count is an average, not a safe bid. Probability displays are rounded to one decimal place.

## Soft bidder support

People sometimes prefer to bid faces their hand supports. That makes the claim more likely to be covered, and **reduces** the chance of a successful Dudo. The effect on the probability of an exact count can go either way.

The optional model conditions the **standing bidder's cup** on holding at least `m = 1` or `m = 2` matching dice for the face they last bid. A matching die includes wild aces for regular-face bids. It uses the bidder's public dice count; it does not add extra dice, mark the rest of that cup as non-matching, or condition every player on this assumption.

Enumerate that cup's possible face multisets using fair-dice multinomial weights. Retain hands with at least `m` matching dice, renormalise their weights, and combine their contribution with an independent binomial for the remaining unknown dice. This gives the **support scenario**, which is exact for that hypothetical conditioning event, not a calibrated model of human behaviour.

```text
Soft-view distribution = (1 - w) * raw distribution + w * support-scenario distribution
Default w = 0.20
```

At 20%, the display mixes 80% of the raw model with 20% of the support scenario. The slider is a modelling choice, not the measured chance that the bidder is honest or has a particular hand. Turning the checkbox off or setting weight to zero restores raw odds.

The fully conditioned scenario is shown in the expanded calculation as a comparison. It is **not a guaranteed real-world bound**. For the same claimed face, stronger support raises coverage and lowers Dudo success under this model. Actual bluff rates and other bids can move the real estimate outside this range.

The assumption is skipped with an explanation if no standing bidder exists, the bidder is the human (own known dice are already counted), the bidder is blind with two or more dice, or the requested minimum exceeds their cup size. One-die players can still see their dice in a blind round, so that bidder can supply evidence.

## Draft raises

The panel tracks the human's legal bid-picker selection. It shows the raw and soft probabilities that the draft would be covered, from the human's viewpoint. These are not the next player's own odds or a prediction of their chance to challenge.

If the draft changes face, the condition still concerns the face the existing bidder actually bid. The calculation enumerates joint face counts (including shared wild aces), rather than incorrectly granting the bidder support for the new face as well.

## Legality and Tropical

The coach does not override game rules. Calza requires fewer than five dice and an eligible turn; a displayed exact-count probability does not mean the button is available or that a call has positive value. During a pending Tropical declaration the previous bid is unchanged, but Dudo and Calza against it are unavailable. The panel labels that restriction.

The coach does not turn Tropical's 9.26% random-hand rate into a truth probability for a declaration. A behavioural model for truthful versus bluffed Tropical declarations would be needed for that.

## Worked check

With 30 total dice, a five-die hand containing no twos or aces, and a bid of eleven twos:

- Raw coverage: 17.8%; Dudo: 82.2%; exact count: 8.6%.
- Assume the five-die bidder has at least two matching dice and use 20% weight: coverage 19.5%; Dudo 80.5%; exact count 9.3%.
- The 100% support scenario has coverage about 26.5% and Dudo about 73.5%.

These numbers and small exhaustive joint-face enumeration cases are regression-tested. No prior assumptions about a particular player's style, all other bid history, or learned bluff frequencies are folded into this deliberately simple coaching model.
